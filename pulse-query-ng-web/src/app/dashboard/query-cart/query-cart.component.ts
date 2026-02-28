/* v8 ignore start */
/** @docs */
import { Component, ChangeDetectionStrategy, input, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

import { QueryCartService } from '../../global/query-cart.service';
import { QueryCartItem } from '../../global/query-cart.models';
import { QueryCartProvisioningService } from '../query-cart-provisioning.service';
import { DashboardStore } from '../dashboard.store';
import { ConfirmDialogComponent } from '../../shared/components/dialogs/confirm-dialog.component';
import { PromptDialogComponent } from '../../shared/components/dialogs/prompt-dialog.component';

/** @docs */
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
  templateUrl: './query-cart.component.html',
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        background: var(--sys-background);
        border-bottom: 1px solid var(--sys-surface-border);
        color: var(--sys-text-primary);
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
        min-height: 100px;
        padding: 12px 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 380px;
        overflow-y: auto;
      }
      .empty-state {
        border: 1px dashed var(--sys-surface-border);
        border-radius: 10px;
        padding: 16px;
        text-align: center;
        color: var(--sys-text-secondary);
        background: var(--sys-surface);
        font-size: 13px;
      }
      .cart-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid var(--sys-surface-border);
        background: var(--sys-surface);
        cursor: grab;
        transition: box-shadow 0.2s;
      }
      .cart-item:hover {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
        font-family: monospace;
      }
      /* Drag Preview Styles */
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 8px;
        padding: 10px 12px;
        background: var(--sys-surface);
        border: 1px solid var(--sys-primary); /* Visualize active drag */
        color: var(--sys-text-primary);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
        width: 260px;
        z-index: 10000;
      }
      .cdk-drag-placeholder {
        border: 1px dashed var(--sys-primary);
        border-radius: 10px;
        background: rgba(var(--sys-primary), 0.04);
        height: 54px;
      }
      .item-actions {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .item-actions button {
        width: 24px;
        height: 24px;
        line-height: 24px;
        padding: 0;
      }
      .item-actions mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .hint {
        padding: 12px;
        text-align: center;
        color: var(--sys-text-secondary);
        font-size: 11px;
        background: var(--sys-surface-variant);
        margin: 16px 16px 0;
        border-radius: 4px;
      }
    `,
  ],
})
/** @docs */
export class QueryCartComponent {
  private readonly cart = inject(QueryCartService);
  private readonly provisioning = inject(QueryCartProvisioningService);
  private readonly store = inject(DashboardStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly dashboardId = input<string | null>(null);
  readonly items = this.cart.items;
  readonly count = this.cart.count;
  readonly connectedDropLists = computed(() => ['dashboard-grid']);

  clear(): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { title: 'Clear Cart', message: 'Remove all saved queries?', isDestructive: true },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) this.cart.clear();
      });
  }

  remove(item: QueryCartItem): void {
    this.cart.remove(item.id);
  }

  rename(item: QueryCartItem): void {
    this.dialog
      .open(PromptDialogComponent, {
        data: { title: 'Rename Query', value: item.title, label: 'Title' },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) this.cart.rename(item.id, res);
      });
  }

  addToDashboard(item: QueryCartItem): void {
    const dashboardId = this.dashboardId();
    if (!dashboardId) return;
    this.provisioning.addToDashboard(item, dashboardId).subscribe({
      next: () => {
        this.snackBar.open(`Added query: ${item.title}`, 'OK', { duration: 3000 });
        this.store.loadDashboard(dashboardId);
      },
      error: () => this.snackBar.open('Failed to add query to dashboard', 'Close'),
    });
  }

  previewSql(sql: string): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const max = 70;
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  }
}
