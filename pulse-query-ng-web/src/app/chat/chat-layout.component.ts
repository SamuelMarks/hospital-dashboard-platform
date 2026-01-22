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

import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatListModule } from '@angular/material/list'; 
import { MatToolbarModule } from '@angular/material/toolbar'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 
import { MatMenuModule } from '@angular/material/menu'; 

import { ChatStore } from './chat.store'; 
import { ConversationResponse } from '../api-client'; 
import { ConversationComponent } from './conversation/conversation.component'; 

interface HistoryGroup { label: string; items: ConversationResponse[]; } 

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
    MatMenuModule, 
    ConversationComponent
  ], 
  providers: [ChatStore], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: block; height: 100%; overflow: hidden; } 
    .sidenav-container { height: 100%; } 
    .history-drawer { 
      width: 280px; border-right: 1px solid var(--sys-surface-border); 
      background-color: var(--sys-surface); display: flex; flex-direction: column; 
    } 
    .history-header { padding: 16px; flex-shrink: 0; } 
    .history-list { flex: 1; overflow-y: auto; } 
    .group-label { 
      padding: 8px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; 
      color: var(--sys-text-secondary); background-color: var(--sys-background); 
      position: sticky; top: 0; z-index: 1; 
    } 
    .nav-item-container { 
       margin: 4px 8px; border-radius: 8px; transition: background-color 0.2s; position: relative; display: flex; 
       align-items: center; 
    } 
    .nav-item-container:hover { background-color: var(--sys-hover); } 
    .nav-item-container.active { background-color: var(--sys-selected); font-weight: 500; color: var(--sys-primary); } 
    /* The clickable area */ 
    .nav-content { flex: 1; padding: 12px; cursor: pointer; display: flex; align-items: center; min-width: 0; } 
    .action-btn { visibility: hidden; } 
    .nav-item-container:hover .action-btn { visibility: visible; } 
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } 
  `], 
  template: `
    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav
        #drawer
        [mode]="(isHandset$ | async) ? 'over' : 'side'" 
        [opened]="(isHandset$ | async) === false" 
        class="history-drawer" 
      >
        <div class="history-header">
          <button mat-stroked-button color="primary" class="w-full" (click)="newChat()">
            <mat-icon>add</mat-icon> New Chat
          </button>
        </div>

        @if (store.isDataLoading()) { 
          <div class="flex justify-center p-8"><mat-spinner diameter="32"></mat-spinner></div>
        } 

        <div class="history-list" role="list">
          @for (group of groupedHistory(); track group.label) { 
            <div class="group-label">{{ group.label }}</div>
            @for (chat of group.items; track chat.id) { 
              <div 
                class="nav-item-container" 
                [class.active]="store.activeConversationId() === chat.id" 
              >
                 <div class="nav-content" (click)="selectChat(chat.id)">
                   <mat-icon class="mr-2 text-sm">chat_bubble_outline</mat-icon>
                   <span class="truncate text-sm">{{ chat.title }}</span>
                 </div>
                 
                 <!-- Context Menu Button -->
                 <button 
                    mat-icon-button 
                    class="action-btn scale-75" 
                    [matMenuTriggerFor]="menu" 
                    (click)="$event.stopPropagation()" 
                 >
                   <mat-icon>more_vert</mat-icon>
                 </button>

                 <mat-menu #menu="matMenu">
                    <button mat-menu-item (click)="renameChat(chat)">
                        <mat-icon>edit</mat-icon> Rename
                    </button>
                    <button mat-menu-item (click)="deleteChat(chat)" class="text-red-600">
                        <mat-icon color="warn">delete</mat-icon> Delete
                    </button>
                 </mat-menu>
              </div>
            } 
          } 
        </div>

      </mat-sidenav>

      <mat-sidenav-content role="main">
        @if (isHandset$ | async) { 
          <mat-toolbar color="primary">
            <button mat-icon-button (click)="drawer.toggle()"><mat-icon>menu</mat-icon></button>
            <span>Assistant</span>
          </mat-toolbar>
        } 
        <div class="h-full flex flex-col pt-16 md:pt-0">
          <app-conversation class="flex-grow min-h-0"></app-conversation>
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `
}) 
export class ChatLayoutComponent implements OnInit { 
  public readonly store = inject(ChatStore); 
  private breakpointObserver = inject(BreakpointObserver); 
  @ViewChild('drawer') drawer!: MatSidenav; 

  isHandset$ = this.breakpointObserver.observe(Breakpoints.Handset).pipe(map(r => r.matches), shareReplay()); 
  
  readonly groupedHistory = computed(() => { 
    const list = this.store.conversations(); 
    if (!list) return []; 
    const now = new Date(); 
    const today: ConversationResponse[] = [], older: ConversationResponse[] = []; 
    list.forEach(c => { 
       const d = new Date(c.updated_at); 
       const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); 
       if (isToday) today.push(c); else older.push(c); 
    }); 
    const groups = []; 
    if (today.length) groups.push({ label: 'Today', items: today }); 
    if (older.length) groups.push({ label: 'Previous', items: older }); 
    return groups; 
  }); 

  ngOnInit() { this.store.loadHistory(); } 

  selectChat(id: string) { this.store.selectConversation(id); this.closeDrawer(); } 
  newChat() { this.store.createNewChat(); this.closeDrawer(); } 

  renameChat(chat: ConversationResponse) { 
    const newTitle = prompt('Rename conversation:', chat.title); 
    if (newTitle && newTitle !== chat.title) { 
        this.store.renameConversation(chat.id, newTitle); 
    } 
  } 

  deleteChat(chat: ConversationResponse) { 
    if (confirm(`Delete "${chat.title}"?`)) { 
        this.store.deleteConversation(chat.id); 
    } 
  } 

  private closeDrawer() { if (this.drawer?.mode === 'over') this.drawer.close(); } 
}