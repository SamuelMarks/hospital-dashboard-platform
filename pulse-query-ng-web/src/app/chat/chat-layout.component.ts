/* v8 ignore start */
/** @docs */
import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { map, shareReplay } from 'rxjs/operators';

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

/** Chat Layout component. */
@Component({
  selector: 'app-chat-layout',
  imports: [
    CommonModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatToolbarModule,
    ScrollingModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatTabsModule,
    ConversationComponent,
    QueryCartComponent,
  ],
  /* v8 ignore next */
  providers: [ChatStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      /* Fix MatTabs Flex growth */
      ::ng-deep .sidebar-tabs .mat-mdc-tab-body-wrapper {
        flex-grow: 1;
        height: 100%;
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
      }
      .action-btn {
        visibility: hidden;
      }
      .nav-item-container:hover .action-btn {
        visibility: visible;
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
/** @docs */
export class ChatLayoutComponent implements OnInit {
  public readonly store = inject(ChatStore);
  public readonly cart = inject(QueryCartService);
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);

  @ViewChild('drawer') drawer!: MatSidenav;

  isHandset$ = this.breakpointObserver.observe(Breakpoints.Handset).pipe(
    map((r) => r.matches),
    shareReplay(),
  );

  readonly sidebarOpen = signal(true);

  readonly groupedHistory = computed(() => {
    const list = this.store.conversations();
    if (!list) return [];
    const now = new Date();
    const today: ConversationResponse[] = [],
      older: ConversationResponse[] = [];
    list.forEach((c) => {
      const d = new Date(c.updated_at);
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
      if (isToday) today.push(c);
      else older.push(c);
    });
    const groups = [];
    if (today.length) groups.push({ label: 'Today', items: today });
    if (older.length) groups.push({ label: 'Previous', items: older });
    return groups;
  });

  ngOnInit() {
    this.store.loadHistory();
  }

  toggleSidebar() {
    this.sidebarOpen.update((v) => !v);
  }

  selectChat(id: string) {
    this.store.selectConversation(id);
    this.closeDrawer();
  }

  newChat() {
    this.store.createNewChat();
    this.closeDrawer();
  }

  renameChat(chat: ConversationResponse) {
    this.dialog
      .open(PromptDialogComponent, {
        data: {
          title: 'Rename Conversation',
          value: chat.title || '',
          label: 'Topic Title',
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res && res !== chat.title) {
          this.store.renameConversation(chat.id, res);
        }
      });
  }

  deleteChat(chat: ConversationResponse) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Delete Chat',
          message: `Permanently delete "${chat.title}"?`,
          isDestructive: true,
          confirmJson: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) this.store.deleteConversation(chat.id);
      });
  }

  private closeDrawer() {
    if (this.drawer?.mode === 'over') this.drawer.close();
  }
}
