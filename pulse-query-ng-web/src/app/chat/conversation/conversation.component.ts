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
import { HttpErrorResponse } from '@angular/common/http';

// Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';

// Core
import { ChatStore } from '../chat.store';
import { AskDataService } from '../../global/ask-data.service';
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
    VizMarkdownComponent,
    VizTableComponent,
    SqlSnippetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .bubble-row {
        display: flex;
        width: 100%;
      }
      .bubble-row.user {
        justify-content: flex-end;
      }
      .bubble-row.assistant {
        justify-content: flex-start;
      }
      .bubble {
        max-width: 90%;
        padding: 12px 16px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.5;
        position: relative;
      }
      .user .bubble {
        background-color: var(--sys-primary);
        color: white;
        border-bottom-right-radius: 2px;
      }
      .assistant .bubble {
        background-color: var(--sys-surface);
        color: var(--sys-text-primary);
        border: 1px solid var(--sys-surface-border);
        border-bottom-left-radius: 2px;
      }
      .input-area {
        padding: 16px;
        background-color: var(--sys-surface);
        border-top: 1px solid var(--sys-surface-border);
        display: flex;
        gap: 8px;
        align-items: flex-end;
      }
      .timestamp {
        font-size: 10px;
        opacity: 0.7;
        margin-top: 4px;
        text-align: right;
        display: block;
      }

      /* Comparison Grid */
      .arena-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        min-width: 250px;
        margin-top: 8px;
      }
      .candidate-card {
        border: 1px solid var(--sys-surface-border);
        background: #fafafa;
        border-radius: 8px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 13px;
      }
      .candidate-header {
        font-weight: bold;
        font-size: 11px;
        text-transform: uppercase;
        color: #666;
        border-bottom: 1px solid #eee;
        padding-bottom: 4px;
      }
      .sql-group-badge {
        font-size: 10px;
        background: #e3f2fd;
        color: #1565c0;
        padding: 2px 6px;
        border-radius: 10px;
      }
      .result-preview {
        border-top: 1px solid #eee;
        padding-top: 8px;
        background: #fff;
        border-radius: 4px;
      }
      .result-preview .table-wrap {
        max-height: 200px;
        overflow: auto;
      }
      .candidate-error {
        background: #fff3f3;
        color: #b71c1c;
        padding: 6px 8px;
        font-size: 11px;
        border-left: 3px solid #b71c1c;
      }
    `,
  ],
  templateUrl: './conversation.component.html',
})
/* v8 ignore start */
export class ConversationComponent implements AfterViewChecked {
  /* v8 ignore stop */
  /** Store. */
  public readonly store = inject(ChatStore);
  /** Scratchpad service for launching SQL in the editor. */
  private readonly scratchpadService = inject(AskDataService);
  /** SQL execution service for candidate previews. */
  private readonly arenaSql = inject(ArenaSqlService);

  /** Scroll container reference for auto-scroll. */
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  /** Current input text for the chat composer. */
  inputText = '';

  /** Candidate preview results keyed by candidate ID. */
  /* istanbul ignore next */
  readonly candidateResults = signal<Record<string, TableDataSet | null>>({});
  /** Candidate execution errors keyed by candidate ID. */
  /* istanbul ignore next */
  readonly candidateErrors = signal<Record<string, string | null>>({});
  /** Candidate loading state keyed by candidate ID. */
  /* istanbul ignore next */
  readonly candidateLoading = signal<Record<string, boolean>>({});

  /** Creates a new ConversationComponent. */
  constructor() {
    effect(() => {
      const len = this.store.messages().length;
      if (len > 0) this.scrollToBottom();
    });
  }

  /** Ng After View Checked. */
  ngAfterViewChecked() {}

  /** Handles enter. */
  handleEnter(e: Event): void {
    const event = e as KeyboardEvent;
    if (event.shiftKey) return;
    event.preventDefault();
    this.send();
  }

  /** Send. */
  send(): void {
    if (!this.inputText.trim()) return;
    this.store.sendMessage(this.inputText);
    this.inputText = '';
  }

  /** Clean Content. */
  cleanContent(msg: MessageResponse): string {
    if (!msg.sql_snippet) return msg.content;
    // Remove code blocks
    return msg.content.replace(/```sql[\s\S]*?```/gi, '').trim();
  }

  /** Clean Content Simple. */
  cleanContentSimple(txt: string): string {
    return txt.replace(/```sql[\s\S]*?```/gi, '').trim();
  }

  /** Run Query. */
  runQuery(sql: string): void {
    this.scratchpadService.open();
  }

  /** Run SQL for a specific candidate and store preview results. */
  runCandidateQuery(candidate: MessageCandidateResponse): void {
    const sql = (candidate.sql_snippet || '').trim();
    if (!sql) return;

    const id = candidate.id;
    if (this.candidateLoading()[id]) return;

    this.candidateLoading.update((state) => ({ ...state, [id]: true }));
    this.candidateErrors.update((state) => ({ ...state, [id]: null }));

    this.arenaSql.execute({ sql, max_rows: 200 }).subscribe({
      next: (res) => {
        if (res.error !== null && res.error !== undefined) {
          this.candidateErrors.update((state) => ({
            ...state,
            [id]: res.error || 'Execution failed.',
          }));
          this.candidateResults.update((state) => ({ ...state, [id]: null }));
        } else {
          this.candidateResults.update((state) => ({
            ...state,
            [id]: { columns: res.columns, data: res.data },
          }));
        }
      },
      error: (err: HttpErrorResponse) => {
        const msg =
          err?.error && err.error.detail
            ? String(err.error.detail)
            : err?.message || 'Execution failed.';
        this.candidateErrors.update((state) => ({ ...state, [id]: msg }));
        this.candidateResults.update((state) => ({ ...state, [id]: null }));
        this.candidateLoading.update((state) => ({ ...state, [id]: false }));
      },
      complete: () => {
        this.candidateLoading.update((state) => ({ ...state, [id]: false }));
      },
    });
  }

  /** Run SQL for all candidates with snippets. */
  runAllCandidates(msg: MessageResponse): void {
    if (!msg.candidates) return;
    msg.candidates.forEach((c) => this.runCandidateQuery(c));
  }

  /** Returns count of candidates that share the same SQL hash. */
  sqlGroupCount(msg: MessageResponse, cand: MessageCandidateResponse): number {
    if (!cand.sql_hash || !msg.candidates) return 0;
    return msg.candidates.filter((c) => c.sql_hash === cand.sql_hash).length;
  }

  /** Candidate loading state. */
  isCandidateLoading(id: string): boolean {
    return !!this.candidateLoading()[id];
  }

  /** Candidate error message. */
  candidateError(id: string): string | null {
    return this.candidateErrors()[id] || null;
  }

  /** Candidate result dataset. */
  candidateResult(id: string): TableDataSet | null {
    return this.candidateResults()[id] || null;
  }

  /** Whether pending Candidates. */
  hasPendingCandidates(msg: MessageResponse): boolean {
    if (msg.role !== 'assistant' || !msg.candidates || msg.candidates.length === 0) return false;
    return !msg.candidates.some((c) => c.is_selected);
  }

  /** Whether any candidate includes a SQL snippet. */
  hasSqlCandidates(msg: MessageResponse): boolean {
    return !!msg.candidates?.some((c) => !!c.sql_snippet);
  }

  /** Vote. */
  vote(msgId: string, candId: string): void {
    this.store.voteCandidate(msgId, candId);
  }

  /** Scrolls the message list to the latest entry. */
  private scrollToBottom(): void {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;
    setTimeout(() => {
      const el = this.scrollContainer?.nativeElement;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }, 50);
  }
}
