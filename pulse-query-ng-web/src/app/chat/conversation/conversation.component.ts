/**
 * @fileoverview Conversation Stream UI.
 *
 * Renders the linear list of messages between User and Assistant.
 *
 * Responsibilities:
 * - Differentiating alignment (Left/Right).
 * - Parsing Markdown content via `VizMarkdownComponent`.
 * - Detecting SQL Code Blocks (```sql) and projecting them into `SqlSnippetComponent`.
 * - Auto-scrolling to bottom on new messages.
 * - Input processing (Typing + Sending).
 */

import {
  Component,
  inject,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Core
import { ChatStore } from '../chat.store';
import { AskDataService } from '../../global/ask-data.service'; // For Scratchpad interactions
import { VizMarkdownComponent } from '../../shared/visualizations/viz-markdown/viz-markdown.component';
import { SqlSnippetComponent } from './sql-snippet.component';
import { MessageResponse } from '../../api-client';

@Component({
  selector: 'app-conversation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    VizMarkdownComponent,
    SqlSnippetComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; background-color: var(--sys-background); }

    .message-list {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .bubble-row {
      display: flex;
      width: 100%;
    }
    .bubble-row.user { justify-content: flex-end; }
    .bubble-row.assistant { justify-content: flex-start; }

    .bubble {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      position: relative;
    }

    /* User Style: Blue, White Text */
    .user .bubble {
      background-color: var(--sys-primary);
      color: white;
      border-bottom-right-radius: 2px;
    }

    /* AI Style: Surface, Text Primary, Border */
    .assistant .bubble {
      background-color: var(--sys-surface);
      color: var(--sys-text-primary);
      border: 1px solid var(--sys-surface-border);
      border-bottom-left-radius: 2px;
    }

    /* Input Area */
    .input-area {
      padding: 16px;
      background-color: var(--sys-surface);
      border-top: 1px solid var(--sys-surface-border);
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .input-field {
      width: 100%;
    }
    textarea {
      resize: none;
      min-height: 24px;
      max-height: 120px;
    }

    /* Timestamp */
    .timestamp {
      font-size: 10px;
      opacity: 0.7;
      margin-top: 4px;
      text-align: right;
      display: block;
    }
  `],
  template: `
    <div class="message-list" #scrollContainer>
      
      <!-- Welcome State -->
      @if (store.messages().length === 0 && !store.isGenerating()) {
        <div class="flex flex-col items-center justify-center h-full text-gray-400 select-none">
          <mat-icon class="text-6xl mb-4 text-gray-300">forum</mat-icon>
          <p>Start a new analysis conversation.</p>
        </div>
      }

      <!-- Timeline -->
      @for (msg of store.messages(); track msg.id) {
        <div class="bubble-row" [ngClass]="msg.role">
          <div class="bubble mat-elevation-z1">
            
            <!-- 1. Text Content (Markdown) -->
            <viz-markdown [content]="cleanContent(msg)"></viz-markdown>

            <!-- 2. SQL Card (Actions) -->
            @if (msg.sql_snippet) {
              <app-sql-snippet 
                [sql]="msg.sql_snippet" 
                (run)="runQuery($event)" 
              ></app-sql-snippet>
            }

            <span class="timestamp">{{ msg.created_at | date:'shortTime' }}</span>
          </div>
        </div>
      }

      <!-- Loading Indicator (Typing) -->
      @if (store.isGenerating()) {
        <div class="bubble-row assistant">
          <div class="bubble" style="padding: 8px 16px;">
            <div class="flex gap-1">
              <span class="animate-bounce">.</span>
              <span class="animate-bounce delay-100">.</span>
              <span class="animate-bounce delay-200">.</span>
            </div>
          </div>
        </div>
      }

      <!-- Error State -->
      @if (store.error(); as err) {
        <div class="w-full text-center p-2 mb-2 bg-red-50 text-red-600 text-xs rounded border border-red-200">
          {{ err }}
        </div>
      }
    </div>

    <!-- Input footer -->
    <div class="input-area">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="flex-grow">
        <textarea 
          matInput 
          placeholder="Ask a question about your data..." 
          [(ngModel)]="inputText" 
          (keydown.enter)="handleEnter($event)" 
          rows="1" 
          cdkTextareaAutosize 
          [disabled]="store.isGenerating()" 
        ></textarea>
      </mat-form-field>
      
      <button 
        mat-icon-button 
        color="primary" 
        class="h-12 w-12" 
        (click)="send()" 
        [disabled]="!inputText.trim() || store.isGenerating()" 
        aria-label="Send Message" 
      >
        <mat-icon>send</mat-icon>
      </button>
    </div>
  `
})
export class ConversationComponent implements AfterViewChecked {
  public readonly store = inject(ChatStore);
  private readonly scratchpadService = inject(AskDataService); // To open sidebar

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  inputText = '';

  constructor() {
    // Auto-scroll on new messages
    effect(() => {
      const len = this.store.messages().length;
      if (len > 0) this.scrollToBottom();
    });
  }

  ngAfterViewChecked() {
    // Ensure scroll sticks to bottom during loading animations
  }

  handleEnter(e: Event): void {
    const event = e as KeyboardEvent;
    if (event.shiftKey) return; // Allow multiline
    event.preventDefault();
    this.send();
  }

  send(): void {
    if (!this.inputText.trim()) return;
    this.store.sendMessage(this.inputText);
    this.inputText = '';
  }

  /**
   * Helper to clean markdown content if we want to avoid duplicate code blocks.
   */
  cleanContent(msg: MessageResponse): string {
    if (!msg.sql_snippet) return msg.content;
    // Remove code blocks
    return msg.content.replace(/```sql[\s\S]*?```/gi, '').trim();
  }

  runQuery(sql: string): void {
    this.scratchpadService.open();
  }

  private scrollToBottom(): void {
    try {
      setTimeout(() => {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }, 50);
    } catch (err) { }
  }
}