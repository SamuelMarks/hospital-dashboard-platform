/* v8 ignore start */
/** @docs */
import {
  Component,
  inject,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  effect,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, retry } from 'rxjs/operators';

// Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

// Core
import { ChatStore } from '../chat.store';
import { AskDataService } from '../../global/ask-data.service';
import { QueryCartService } from '../../global/query-cart.service';
import { VizMarkdownComponent } from '../../shared/visualizations/viz-markdown/viz-markdown.component';
import { SqlSnippetComponent } from './sql-snippet.component';
import { MessageResponse, MessageCandidateResponse } from '../../api-client';
import {
  VizTableComponent,
  TableDataSet,
} from '../../shared/visualizations/viz-table/viz-table.component';
import { ArenaSqlService } from '../arena-sql.service';

/** Conversation component. */
@Component({
  selector: 'app-conversation',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatProgressBarModule,
    MatChipsModule,
    MatTooltipModule,
    VizMarkdownComponent,
    VizTableComponent,
    SqlSnippetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversation.component.html',
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background-color: var(--sys-background);
      }
      .message-list {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .empty-state-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--sys-outline);
        user-select: none;
      }
      .icon-hero {
        font-size: 64px;
        height: 64px;
        width: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
      }
      .message-row {
        display: flex;
        width: 100%;
      }
      .message-row.user {
        justify-content: flex-end;
      }
      .message-row.assistant {
        justify-content: flex-start;
      }
      .message-bubble {
        max-width: 90%;
        border-radius: 16px;
        box-shadow: none !important;
        border: 1px solid var(--sys-surface-border);
        background-color: var(--sys-surface);
        color: var(--sys-on-surface);
      }
      .user-bubble {
        background-color: var(--sys-primary-container) !important;
        color: var(--sys-on-primary-container) !important;
        border: none;
        border-bottom-right-radius: 4px;
      }
      .message-footer {
        padding: 8px 16px;
        font-size: 11px;
        opacity: 0.7;
        text-align: right;
        color: inherit;
      }
      .arena-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--sys-surface-border);
        padding-bottom: 8px;
        width: 100%;
      }
      .mat-label-small {
        font-size: 11px;
        text-transform: uppercase;
        font-weight: 500;
        letter-spacing: 0.5px;
      }
      .candidates-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
        width: 100%;
      }
      .candidate-item {
        border: 1px solid var(--sys-outline-variant);
        border-radius: 8px;
        background-color: var(--sys-background);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .candidate-meta {
        background-color: var(--sys-surface-variant);
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--sys-on-surface-variant);
      }
      .candidate-body {
        padding: 12px;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
      }
      .candidate-actions {
        padding: 8px;
        border-top: 1px solid var(--sys-surface-border);
      }
      .error-container {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border-radius: 4px;
        background-color: var(--sys-error-container);
        color: var(--sys-on-error-container);
        font-family: 'Roboto Mono', monospace;
        font-size: 12px;
        border-left: 3px solid var(--sys-error);
      }
      .icon-small {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .loading-bubble {
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 60px;
      }
      .composer-container {
        padding: 16px;
        background-color: var(--sys-surface);
        border-top: 1px solid var(--sys-surface-border);
        position: relative;
        z-index: 10;
      }
      .group-badge {
        background-color: var(--sys-secondary-container);
        color: var(--sys-on-secondary-container);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
      }
      .table-preview {
        max-height: 200px;
        overflow: auto;
        margin-top: 8px;
        border-radius: 4px;
        border: 1px solid var(--sys-surface-border);
      }
      .global-error-toast {
        padding: 12px;
        background-color: var(--sys-error-container);
        color: var(--sys-on-error-container);
        border-left: 4px solid var(--sys-error);
        border-radius: 4px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
      }
      .model-selector {
        padding-bottom: 12px;
      }
    `,
  ],
})
/** @docs */
export class ConversationComponent implements AfterViewChecked {
  /** Access the chat store. */
  public readonly store = inject(ChatStore);
  /** Access the scratchpad service. */
  private readonly scratchpadService = inject(AskDataService);
  /** Access the arena SQL service. */
  private readonly arenaSql = inject(ArenaSqlService);
  /** Access the query cart service. */
  private readonly cart = inject(QueryCartService);
  /** Access the router. */
  private readonly router = inject(Router);
  /** Access the snackbar. */
  private readonly snackBar = inject(MatSnackBar);

  /** Reference to the scroll container. */
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  /** Input text model. */
  inputText = '';

  /** Signal map for candidate results. */
  readonly candidateResults = signal<Record<string, TableDataSet | null>>({});
  /** Signal map for candidate errors. */
  readonly candidateErrors = signal<Record<string, string | null>>({});
  /** Signal map for candidate loading states. */
  readonly candidateLoading = signal<Record<string, boolean>>({});

  /** Creates a new ConversationComponent. */
  constructor() {
    effect(() => {
      const len = this.store.messages().length;
      if (len > 0) this.scrollToBottom();
    });
  }

  /** Angular lifecycle hook. */
  ngAfterViewChecked() {}

  /** Handles Enter key press. */
  handleEnter(e: Event): void {
    const event = e as KeyboardEvent;
    if (event.shiftKey) return;
    event.preventDefault();
    this.send();
  }

  /** Sends the current message. */
  send(): void {
    if (!this.inputText.trim()) return;
    this.store.sendMessage(this.inputText);
    this.inputText = '';
  }

  /** Cleans message content removing SQL blocks. */
  cleanContent(msg: MessageResponse): string {
    const content = msg.content || '';
    if (!content.trim() && !msg.sql_snippet) {
      return '';
    }
    if (!msg.sql_snippet) return content;
    return content.replace(/```sql[\s\S]*?```/gi, '').trim();
  }

  /** Cleans content string. */
  cleanContentSimple(txt: string): string {
    return (txt || '').replace(/```sql[\s\S]*?```/gi, '').trim();
  }

  /** Opens query in scratchpad. */
  runQuery(sql: string): void {
    this.scratchpadService.open();
  }

  /** Saves query to cart. */
  saveToCart(sql: string): void {
    if (!sql) return;
    this.cart.add(sql);
    this.snackBar.open('Saved to Query Cart 🛒', 'OK', { duration: 2500 });
  }

  /** Navigates to simulation with sql. */
  simulateQuery(sql: string): void {
    if (!sql) return;
    this.router.navigate(['/simulation'], { queryParams: { sql } });
  }

  /**
   * Runs a specific candidate's SQL query.
   * Implements retry logic: Retry twice then fail.
   */
  runCandidateQuery(candidate: MessageCandidateResponse): void {
    const sql = (candidate.sql_snippet || '').trim();
    if (!sql) return;

    const id = candidate.id;
    if (this.candidateLoading()[id]) return;

    this.candidateLoading.update((state) => ({ ...state, [id]: true }));
    this.candidateErrors.update((state) => ({ ...state, [id]: null }));

    this.arenaSql
      .execute({ sql, max_rows: 200 })
      .pipe(retry(2)) /* Retry applied here */
      .subscribe({
        next: (res) => {
          if (res.error) {
            this.candidateErrors.update((state) => ({ ...state, [id]: res.error || 'Err' }));
            this.candidateResults.update((state) => ({ ...state, [id]: null }));
          } else {
            this.candidateResults.update((state) => ({
              ...state,
              [id]: { columns: res.columns, data: res.data },
            }));
          }
        },
        error: (err: HttpErrorResponse) => {
          // Enhanced Error Extraction (Handles status 0/undefined detail)
          let msg = err?.message || 'Unknown error';
          if (err.status === 0) {
            msg = 'Network Error: Cannot reach server.';
          } else if (err.error && err.error.detail) {
            msg = String(err.error.detail);
          }

          this.candidateErrors.update((state) => ({ ...state, [id]: msg }));
          this.candidateResults.update((state) => ({ ...state, [id]: null }));
          this.candidateLoading.update((state) => ({ ...state, [id]: false }));
        },
        complete: () => {
          this.candidateLoading.update((state) => ({ ...state, [id]: false }));
        },
      });
  }

  /** Runs all candidates in the message. */
  runAllCandidates(msg: MessageResponse): void {
    if (!msg.candidates) return;
    msg.candidates.forEach((c) => this.runCandidateQuery(c));
  }

  /** Counts duplicate SQL hashes for grouping. */
  sqlGroupCount(msg: MessageResponse, cand: MessageCandidateResponse): number {
    if (!cand.sql_hash || !msg.candidates) return 0;
    return msg.candidates.filter((c) => c.sql_hash === cand.sql_hash).length;
  }

  /** Checks loading state for a candidate. */
  isCandidateLoading(id: string): boolean {
    return !!this.candidateLoading()[id];
  }

  /** Gets candidate error message. */
  candidateError(id: string): string | null {
    return this.candidateErrors()[id] || null;
  }

  /** Gets candidate result data. */
  candidateResult(id: string): TableDataSet | null {
    return this.candidateResults()[id] || null;
  }

  /** Checks if message has unselected candidates. */
  hasPendingCandidates(msg: MessageResponse): boolean {
    if (msg.role !== 'assistant' || !msg.candidates || msg.candidates.length === 0) return false;
    const isPending = !msg.candidates.some((c) => c.is_selected);
    if (!isPending && (!msg.content || msg.content.trim() === '')) {
      return true;
    }
    return isPending;
  }

  /** Checks if message has any SQL snippets in candidates. */
  hasSqlCandidates(msg: MessageResponse): boolean {
    return !!msg.candidates?.some((c) => !!c.sql_snippet);
  }

  /** Votes for a candidate. */
  vote(msgId: string, candId: string): void {
    this.store.voteCandidate(msgId, candId);
  }

  /** Scrolls chat to bottom. */
  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.scrollContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }
}
