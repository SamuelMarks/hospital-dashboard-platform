import { Component, ChangeDetectionStrategy, input, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { QueryCartService } from '../../global/query-cart.service';
import { QueryCartItem } from '../../global/query-cart.models';
import { QueryCartProvisioningService } from '../query-cart-provisioning.service';
import { DashboardStore } from '../dashboard.store';

/**
 * Sidebar panel that displays Query Cart items for drag-and-drop.
 */
@Component({
  selector: 'app-query-cart',
  imports: [
    CommonModule,
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        background: var(--sys-background);
        border-bottom: 1px solid var(--sys-surface-border);
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        gap: 12px;
        border-bottom: 1px solid var(--sys-surface-border);
        background: var(--sys-surface);
      }
      .title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: var(--sys-text-primary);
      }
      .count-pill {
        font-size: 11px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--sys-primary-container);
        color: var(--sys-on-primary-container);
      }
      .cart-list {
        padding: 12px 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 260px;
        overflow-y: auto;
      }
      .empty-state {
        border: 1px dashed var(--sys-surface-border);
        border-radius: 10px;
        padding: 16px;
        text-align: center;
        color: var(--sys-text-secondary);
        background: var(--sys-surface);
      }
      .cart-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid var(--sys-surface-border);
        background: white;
        cursor: grab;
      }
      .cart-item:active {
        cursor: grabbing;
      }
      .drag-handle {
        color: var(--sys-text-secondary);
        cursor: grab;
        margin-top: 2px;
      }
      .item-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .item-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--sys-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .item-sql {
        font-size: 11px;
        color: var(--sys-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .item-actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .hint {
        font-size: 11px;
        color: var(--sys-text-secondary);
        padding: 0 16px 12px;
      }
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 8px;
        padding: 10px 12px;
        background: white;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
        width: 260px;
      }
      .cdk-drag-placeholder {
        border: 1px dashed var(--sys-primary);
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.04);
        height: 54px;
      }
    `,
  ],
  templateUrl: './query-cart.component.html',
})
export class QueryCartComponent {
  /** cart property. */
  private readonly cart = inject(QueryCartService);
  /** provisioning property. */
  private readonly provisioning = inject(QueryCartProvisioningService);
  /** store property. */
  private readonly store = inject(DashboardStore);
  /** snackBar property. */
  private readonly snackBar = inject(MatSnackBar);

  /** Optional dashboard id to enable the "Add" action. */
  readonly dashboardId = input<string | null>(null);

  /** Items from the cart service. */
  readonly items = this.cart.items;

  /** Count of cart items. */
  readonly count = this.cart.count;

  /** Drop list connection for dashboard grid. */
  readonly connectedDropLists = computed(() => ['dashboard-grid']);

  /** Clears all items from the cart. */
  clear(): void {
    this.cart.clear();
  }

  /** Removes a cart item. */
  remove(item: QueryCartItem): void {
    this.cart.remove(item.id);
  }

  /** Prompts to rename a cart item. */
  rename(item: QueryCartItem): void {
    const next = window.prompt('Rename query', item.title);
    if (next !== null) this.cart.rename(item.id, next);
  }

  /** Provisions the cart item into the active dashboard. */
  addToDashboard(item: QueryCartItem): void {
    const dashboardId = this.dashboardId();
    if (!dashboardId) return;

    this.provisioning.addToDashboard(item, dashboardId).subscribe({
      next: () => {
        this.snackBar.open(`Added query: ${item.title}`, 'OK', { duration: 3000 });
        this.store.loadDashboard(dashboardId);
      },
      error: () => {
        this.snackBar.open('Failed to add query to dashboard', 'Close');
      },
    });
  }

  /** Builds a short, single-line preview of SQL text. */
  previewSql(sql: string): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const max = 70;
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  }
}
