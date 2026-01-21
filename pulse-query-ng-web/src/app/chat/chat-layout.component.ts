/**
 * @fileoverview Main Layout for the Chat Feature Module.
 *
 * Implements a Master-Detail interface:
 * - Left Sidebar: Historical conversation list.
 * - Main Area: Active conversation stream.
 *
 * Features:
 * - Responsive Sidenav (collapses on mobile).
 * - "New Chat" Action.
 * - Virtual Scrolling for performance with large history lists (using CDK).
 * - Date-grouped history display.
 */

import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ViewChild,
  computed,
  Signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { map, shareReplay } from 'rxjs/operators';
import { Observable } from 'rxjs';

// Material
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Core
import { ChatStore } from './chat.store';
import { ConversationResponse } from '../api-client';
import { ConversationComponent } from './conversation/conversation.component';

/** Helper Interface for Grouped Lists */
interface HistoryGroup {
  label: string;
  items: ConversationResponse[];
}

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  imports: [
    CommonModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatToolbarModule,
    ScrollingModule,
    MatProgressSpinnerModule,
    ConversationComponent
  ],
  providers: [ChatStore], // Feature-level store (created new instance for this route tree)
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
    }
    .sidenav-container {
      height: 100%;
    }
    .history-drawer {
      width: 280px;
      border-right: 1px solid var(--sys-surface-border);
      background-color: var(--sys-surface);
      display: flex;
      flex-direction: column;
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
    .nav-item {
      cursor: pointer;
      border-radius: 8px;
      margin: 4px 8px;
      transition: background-color 0.2s;
    }
    .nav-item:hover {
      background-color: var(--sys-hover);
    }
    .nav-item.active {
      background-color: var(--sys-selected);
      color: var(--sys-primary);
      font-weight: 500;
    }
    .cdk-virtual-scroll-viewport {
      height: 100%;
      width: 100%;
    }
    /* Mobile Override */
    .mobile-toolbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
    }
  `],
  template: `
    <mat-sidenav-container class="sidenav-container">

      <!-- SIDEBAR: HISTORY -->
      <mat-sidenav
        #drawer
        [mode]="(isHandset$ | async) ? 'over' : 'side'"
        [opened]="(isHandset$ | async) === false"
        class="history-drawer"
        [attr.role]="'navigation'"
        aria-label="Conversation History"
      >
        <div class="history-header">
          <button mat-stroked-button color="primary" class="w-full" (click)="newChat()">
            <mat-icon>add</mat-icon> New Chat
          </button>
        </div>

        @if (store.isDataLoading()) {
          <div class="flex justify-center p-8">
            <mat-spinner diameter="32"></mat-spinner>
          </div>
        }

        <!-- Grouped List Visualization -->
        <mat-nav-list class="history-list">
          @for (group of groupedHistory(); track group.label) {
            <div class="group-label">{{ group.label }}</div>
            @for (chat of group.items; track chat.id) {
              <a
                mat-list-item
                class="nav-item"
                [class.active]="store.activeConversationId() === chat.id"
                (click)="selectChat(chat.id)"
                (keydown.enter)="selectChat(chat.id)"
                tabindex="0"
              >
                <mat-icon matListItemIcon>chat_bubble_outline</mat-icon>
                <div matListItemTitle class="truncate text-sm">{{ chat.title }}</div>
              </a>
            }
          }
        </mat-nav-list>

      </mat-sidenav>

      <!-- MAIN CONTENT -->
      <mat-sidenav-content role="main">
        <!-- Mobile Toggle -->
        @if (isHandset$ | async) {
          <mat-toolbar color="primary" class="mobile-toolbar">
            <button mat-icon-button (click)="drawer.toggle()" aria-label="Toggle menu">
              <mat-icon>menu</mat-icon>
            </button>
            <span>Analytics Assistant</span>
          </mat-toolbar>
        }

        <!-- Conversation View -->
        <div class="h-full flex flex-col pt-16 md:pt-0">
          <app-conversation class="flex-grow min-h-0"></app-conversation>
        </div>

      </mat-sidenav-content>

    </mat-sidenav-container>
  `
})
export class ChatLayoutComponent implements OnInit {
  /** Access to the feature store instance. */
  public readonly store = inject(ChatStore);
  private breakpointObserver = inject(BreakpointObserver);
  private router = inject(Router);

  @ViewChild('drawer') drawer!: MatSidenav;

  /**
   * Observable tracking screen size.
   * returns True if mobile/handset layout.
   */
  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.Handset)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );

  /**
   * Transforms the flat conversation list into groups (Today, Yesterday, Older).
   */
  readonly groupedHistory: Signal<HistoryGroup[]> = computed(() => {
    const list = this.store.conversations();
    if (!list) return [];

    const now = new Date();
    const today: ConversationResponse[] = [];
    const yesterday: ConversationResponse[] = [];
    const older: ConversationResponse[] = [];

    list.forEach(c => {
      const d = new Date(c.updated_at);
      const diffTime = Math.abs(now.getTime() - d.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 1 && now.getDate() === d.getDate()) today.push(c);
      else if (diffDays <= 2) yesterday.push(c);
      else older.push(c);
    });

    const groups = [];
    if (today.length) groups.push({ label: 'Today', items: today });
    if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday });
    if (older.length) groups.push({ label: 'Previous 30 Days', items: older });

    return groups;
  });

  ngOnInit(): void {
    // Initial fetch
    this.store.loadHistory();
  }

  /**
   * Switches the active conversation.
   * Automatically closes drawer on mobile.
   *
   * @param {string} id - Target conversation UUID.
   */
  selectChat(id: string): void {
    this.store.selectConversation(id);
    this.closeDrawerIfHandset();
  }

  /**
   * Resets active conversation to start fresh.
   */
  newChat(): void {
    this.store.createNewChat();
    this.closeDrawerIfHandset();
  }

  private closeDrawerIfHandset(): void {
    // Check observable value synchronously? Or just toggle if mode is 'over'
    if (this.drawer && this.drawer.mode === 'over') {
      this.drawer.close();
    }
  }
}