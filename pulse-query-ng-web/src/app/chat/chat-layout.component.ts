/**
 * @fileoverview Layout container component for the conversational AI workspace,
 * combining conversation history navigation, the active chat view, and the query cart.
 */
import { DATE_NOW } from '../core/time.token';
import { Component, OnInit, inject, viewChild, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';

import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';

import { ChatStore } from './chat.store';
import { ConversationResponse } from '../api-client';
import { ConversationComponent } from './conversation/conversation.component';
import { QueryCartComponent } from '../dashboard/query-cart/query-cart.component';
import { QueryCartService } from '../global/query-cart.service';
import { PromptDialogComponent } from '../shared/components/dialogs/prompt-dialog.component';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';

/** Layout container component hosting conversation history, active chat thread, and query cart drawer. */
@Component({
  selector: 'app-chat-layout',
  imports: [
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatTabsModule,
    ConversationComponent,
    QueryCartComponent,
  ],

  providers: [ChatStore],

  templateUrl: './chat-layout.component.html',
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }
      .sidenav-container {
        height: 100%;
      }
      .history-drawer {
        width: 320px;
        border-right: 1px solid var(--sys-surface-border);
        background-color: var(--sys-surface);
        display: flex;
        flex-direction: column;
      }
      .sidebar-tabs {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .tab-column {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .history-header {
        padding: 16px;
        flex-shrink: 0;
      }
      .history-list {
        flex: 1;
        overflow-y: auto;
      }
      .group-label {
        padding: 8px 16px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
        background-color: var(--sys-background);
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .nav-item-container {
        margin: 4px 8px;
        border-radius: 8px;
        transition: background-color 0.2s;
        position: relative;
        display: flex;
        align-items: center;
      }
      .nav-item-container:hover {
        background-color: var(--sys-hover);
      }
      .nav-item-container.active {
        background-color: var(--sys-selected);
        font-weight: 500;
        color: var(--sys-primary);
      }
      .nav-content {
        flex: 1;
        padding: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        min-width: 0;
        background: transparent;
        border: none;
        color: inherit;
        font: inherit;
        text-align: left;
      }
      .action-btn {
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .nav-item-container:hover .action-btn,
      .nav-item-container:focus-within .action-btn {
        opacity: 1;
      }
      .truncate {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .icon-sm {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .badgex {
        background: var(--sys-primary);
        color: white;
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 10px;
        margin-left: 4px;
      }
    `,
  ],
})
export class ChatLayoutComponent implements OnInit {
  /** Provider function returning the current date/time. */
  private readonly dateNow = inject(DATE_NOW);
  /** Centralized state store for chat conversations and messages. */
  public readonly store = inject(ChatStore);
  /** Service managing the user's saved SQL query cart. */
  public readonly cart = inject(QueryCartService);
  /** Material dialog service for confirmation and prompt modals. */
  private readonly dialog = inject(MatDialog);
  /** Observer for responsive viewport breakpoints. */
  private readonly breakpointObserver = inject(BreakpointObserver);

  /** Reference to the Material sidenav drawer hosting conversation history. */
  readonly drawer = viewChild<Pick<MatSidenav, 'mode' | 'close'>>('drawer');

  /** Signal indicating whether the viewport matches handset dimensions. */
  isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  /** Signal controlling whether the sidebar drawer is open on desktop viewports. */
  readonly sidebarOpen = signal(true);

  /** Conversation history grouped into 'Today' and 'Previous' buckets. */
  readonly groupedHistory = computed(() => {
    const list = this.store.conversations() ?? [];
    const todayStr = this.dateNow().toDateString();
    const today: ConversationResponse[] = [],
      older: ConversationResponse[] = [];
    list.forEach((c) => {
      const d = new Date(c.updated_at);
      if (d.toDateString() === todayStr) today.push(c);
      else older.push(c);
    });
    const groups = [];
    if (today.length) groups.push({ label: $localize`Today`, items: today });
    if (older.length) groups.push({ label: $localize`Previous`, items: older });
    return groups;
  });

  /** Loads the conversation history when the layout initializes. */
  ngOnInit(): void {
    this.store.loadHistory();
  }

  /** Toggles the visibility of the history sidebar drawer. */
  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  /**
   * Selects a conversation by ID and closes the drawer on mobile viewports.
   *
   * @param id - The unique identifier of the conversation to select.
   */
  selectChat(id: string): void {
    this.store.selectConversation(id);
    this.closeDrawer();
  }

  /** Resets the active conversation to start a new chat session. */
  newChat(): void {
    this.store.createNewChat();
    this.closeDrawer();
  }

  /**
   * Returns a localized accessible label for the conversation options menu button.
   *
   * @param chat - The conversation item.
   * @returns Localized ARIA label string.
   */
  getOptionsAriaLabel(chat: ConversationResponse): string {
    return $localize`Conversation options for ${chat.title}`;
  }

  /**
   * Opens a prompt dialog to rename an existing conversation.
   *
   * @param chat - The conversation record to rename.
   */
  renameChat(chat: ConversationResponse): void {
    this.dialog
      .open(PromptDialogComponent, {
        data: {
          title: $localize`Rename Conversation`,
          value: chat.title || '',
          label: $localize`Topic Title`,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res && res !== chat.title) {
          this.store.renameConversation(chat.id, res);
        }
      });
  }

  /**
   * Opens a confirmation dialog and deletes the specified conversation if confirmed.
   *
   * @param chat - The conversation record to delete.
   */
  deleteChat(chat: ConversationResponse): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: $localize`Delete Chat`,
          message: $localize`Permanently delete "${chat.title}"?`,
          isDestructive: true,
          confirmJson: $localize`Delete`,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) this.store.deleteConversation(chat.id);
      });
  }

  /** Closes the sidenav drawer when operating in overlay ('over') mode. */
  private closeDrawer(): void {
    const drawer = this.drawer();
    if (drawer?.mode === 'over') drawer.close();
  }
}
