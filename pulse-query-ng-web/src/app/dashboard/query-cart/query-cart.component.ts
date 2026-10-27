/**
 * @fileoverview Query Cart sidebar component displaying saved SQL snippets that can be
 * renamed, removed, or dragged onto a dashboard grid.
 */
import { Component, input, inject, computed, OnDestroy } from '@angular/core';
import { DOCUMENT } from '@angular/common';
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

/**
 * Component displaying the user's saved SQL queries with drag-and-drop dashboard provisioning.
 */
@Component({
  selector: 'app-query-cart',
  imports: [DragDropModule, MatButtonModule, MatIconModule, MatTooltipModule, MatSnackBarModule],

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
export class QueryCartComponent implements OnDestroy {
  /** Service managing the persistent query cart state. */
  private readonly cart = inject(QueryCartService);
  /** Service provisioning dashboard widgets from query cart items. */
  private readonly provisioning = inject(QueryCartProvisioningService);
  /** Active dashboard state store. */
  private readonly store = inject(DashboardStore);
  /** Material snackbar for status notifications. */
  private readonly snackBar = inject(MatSnackBar);
  /** Material dialog service for confirmation and rename modals. */
  private readonly dialog = inject(MatDialog);
  /** Injected DOM document reference for focus restoration. */
  private readonly document = inject(DOCUMENT);
  /** Element that held focus before the QueryCart drawer or dialog was opened. */
  private readonly initialTriggerElement: HTMLElement | null =
    this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;

  /** Optional target dashboard ID when rendered inside a dashboard editor. */
  readonly dashboardId = input<string | null>(null);
  /** Signal list of items currently in the query cart. */
  readonly items = this.cart.items;
  /** Signal count of items currently in the query cart. */
  readonly count = this.cart.count;
  /** Connected CDK drop list IDs for dragging cart items onto the dashboard grid. */
  readonly connectedDropLists = computed(() => ['dashboard-grid']);

  /** Restores focus to the trigger button when the QueryCart drawer is destroyed/closed. */
  ngOnDestroy(): void {
    this.restoreFocus(this.initialTriggerElement);
  }

  /**
   * Restores focus to the specified trigger element if available.
   *
   * @param trigger - HTML element to focus.
   */
  restoreFocus(trigger: HTMLElement | null): void {
    if (trigger && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  /** Prompts the user for confirmation and clears all items from the query cart. */
  clear(): void {
    const trigger =
      this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: $localize`Clear Cart`,
          message: $localize`Remove all saved queries?`,
          isDestructive: true,
        },
        restoreFocus: true,
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) this.cart.clear();
        this.restoreFocus(trigger);
      });
  }

  /**
   * Removes a single item from the query cart.
   *
   * @param item - The query cart item to remove.
   */
  remove(item: QueryCartItem): void {
    this.cart.remove(item.id);
  }

  /**
   * Opens a prompt dialog to rename a query cart item.
   *
   * @param item - The query cart item to rename.
   */
  rename(item: QueryCartItem): void {
    const trigger =
      this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    this.dialog
      .open(PromptDialogComponent, {
        data: {
          title: $localize`Rename Query`,
          value: item.title,
          label: $localize`Title`,
        },
        restoreFocus: true,
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) this.cart.rename(item.id, res);
        this.restoreFocus(trigger);
      });
  }

  /**
   * Provisions the specified cart item as a new widget on the active dashboard.
   *
   * @param item - The query cart item to add to the dashboard.
   */
  addToDashboard(item: QueryCartItem): void {
    const dashboardId = this.dashboardId();
    if (!dashboardId) return;
    this.provisioning.addToDashboard(item, dashboardId).subscribe({
      next: () => {
        this.snackBar.open($localize`Added query: ${item.title}`, $localize`OK`, {
          duration: 3000,
        });
        this.store.loadDashboard(dashboardId);
      },
      error: () =>
        this.snackBar.open($localize`Failed to add query to dashboard`, $localize`Close`),
    });
  }

  /**
   * Normalizes whitespace and truncates a SQL query string for compact preview display.
   *
   * @param sql - Raw SQL query string.
   * @returns Single-line truncated SQL preview string.
   */
  previewSql(sql: string): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const max = 70;
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  }
}
