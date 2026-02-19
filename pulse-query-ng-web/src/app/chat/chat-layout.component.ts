import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ViewChild,
  computed,
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

import { ChatStore } from './chat.store';
import { ConversationResponse } from '../api-client';
import { ConversationComponent } from './conversation/conversation.component';
import { QueryCartComponent } from '../dashboard/query-cart/query-cart.component';
import { QueryCartService } from '../global/query-cart.service';

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
  providers: [ChatStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  templateUrl: './chat-layout.component.html',
})
export class ChatLayoutComponent implements OnInit {
  /** Store. */
  public readonly store = inject(ChatStore);
  /** Cart Service. */
  public readonly cart = inject(QueryCartService);

  /** breakpointObserver property. */
  private breakpointObserver = inject(BreakpointObserver);
  /** Drawer. */
  @ViewChild('drawer') drawer!: MatSidenav;

  /** Whether handset$. */
  isHandset$ = this.breakpointObserver.observe(Breakpoints.Handset).pipe(
    map((r) => r.matches),
    shareReplay(),
  );

  /** Grouped History. */
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

  /** Ng On Init. */
  ngOnInit() {
    this.store.loadHistory();
  }

  /** Select Chat. */
  selectChat(id: string) {
    this.store.selectConversation(id);
    this.closeDrawer();
  }

  /** New Chat. */
  newChat() {
    this.store.createNewChat();
    this.closeDrawer();
  }

  /** Rename Chat. */
  renameChat(chat: ConversationResponse) {
    // Fix TS2345: Handle potential null/undefined title by defaulting to empty string
    const newTitle = prompt('Rename conversation:', chat.title || '');
    if (newTitle && newTitle !== chat.title) {
      this.store.renameConversation(chat.id, newTitle);
    }
  }

  /** Deletes chat. */
  deleteChat(chat: ConversationResponse) {
    if (confirm(`Delete "${chat.title}"?`)) {
      this.store.deleteConversation(chat.id);
    }
  }

  /** closeDrawer method. */
  private closeDrawer() {
    if (this.drawer?.mode === 'over') this.drawer.close();
  }
}
