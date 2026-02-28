/* v8 ignore start */
/** @docs */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { finalize } from 'rxjs/operators';

import { AnalyticsService, LlmAnalyticsRow } from './analytics.service';

/** Analytics component. */
@Component({
  selector: 'app-analytics',
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        padding: 24px;
      }
      .page {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
      }
      .title h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 400;
      }
      .title p {
        margin: 4px 0 0;
        color: var(--sys-text-secondary);
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
      }
      .summary-card {
        border: 1px solid var(--sys-surface-border);
        background: var(--sys-surface);
        padding: 16px;
      }
      .metric-value {
        font-size: 24px;
        font-weight: 500;
      }
      .metric-label {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
        letter-spacing: 0.04em;
      }
      .filters-card {
        border: 1px solid var(--sys-surface-border);
        background: var(--sys-surface);
        padding: 12px 16px;
      }
      .filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        align-items: end;
      }
      .filters .actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .content-grid {
        display: grid;
        grid-template-columns: minmax(0, 2.1fr) minmax(280px, 1fr);
        gap: 16px;
      }
      .table-card {
        border: 1px solid var(--sys-surface-border);
        background: var(--sys-surface);
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 420px;
      }
      .table-wrapper {
        overflow: auto;
        max-height: 520px;
      }
      .table-footer {
        padding: 8px 16px;
        font-size: 12px;
        color: var(--sys-text-secondary);
        border-top: 1px solid var(--sys-surface-border);
      }
      .analytics-table {
        width: 100%;
      }
      .analytics-table th {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--sys-text-secondary);
      }
      .analytics-table td {
        vertical-align: top;
      }
      .row {
        cursor: pointer;
      }
      .row.selected {
        background: var(--sys-selected);
      }
      .cell-primary {
        font-weight: 500;
        color: var(--sys-on-surface);
      }
      .cell-secondary {
        font-size: 11px;
        color: var(--sys-text-secondary);
        margin-top: 2px;
      }
      .sql-preview {
        font-family:
          'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
          monospace;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 420px;
        display: block;
      }
      .score-chip {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .score-chip.selected {
        background-color: rgba(21, 101, 192, 0.12);
        color: var(--sys-primary);
      }
      .score-chip.unselected {
        background-color: rgba(88, 94, 113, 0.12);
        color: var(--sys-on-surface-variant);
      }
      .detail-card {
        border: 1px solid var(--sys-surface-border);
        background: var(--sys-surface);
        padding: 16px;
        min-height: 420px;
      }
      .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .detail-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }
      .detail-section {
        margin-bottom: 12px;
      }
      .detail-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--sys-text-secondary);
        margin-bottom: 4px;
      }
      .detail-value {
        font-size: 14px;
      }
      .sql-block {
        font-family:
          'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
          monospace;
        font-size: 12px;
        background: var(--sys-background);
        border: 1px solid var(--sys-surface-border);
        border-radius: 6px;
        padding: 12px;
        max-height: 280px;
        overflow: auto;
        white-space: pre-wrap;
      }
      .empty-state {
        text-align: center;
        color: var(--sys-text-secondary);
        padding: 32px;
      }
      .mt-2 {
        margin-top: 8px;
      }
      .status-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--sys-text-secondary);
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--sys-outline);
      }
      .status-dot.active {
        background: var(--sys-primary);
      }
      @media (max-width: 1024px) {
        .content-grid {
          grid-template-columns: 1fr;
        }
        .table-wrapper {
          max-height: none;
        }
      }
    `,
  ],
  templateUrl: './analytics.component.html',
})
/* v8 ignore start */
export class AnalyticsComponent implements OnInit {
  /* v8 ignore stop */
  /** Analytics API client. */
  private readonly analyticsApi = inject(AnalyticsService);

  /** Full set of analytics rows. */
  /* istanbul ignore next */
  readonly rows = signal<LlmAnalyticsRow[]>([]);
  /** Loading state for the page. */
  /* istanbul ignore next */
  readonly isLoading = signal(true);
  /** Error state for load failures. */
  /* istanbul ignore next */
  readonly error = signal<string | null>(null);
  /** Currently selected row for the detail pane. */
  /* istanbul ignore next */
  readonly selectedRow = signal<LlmAnalyticsRow | null>(null);

  /** Search filter text. */
  /* istanbul ignore next */
  readonly searchText = signal('');
  /** LLM filter value. */
  /* istanbul ignore next */
  readonly modelFilter = signal('all');
  /** User filter value. */
  /* istanbul ignore next */
  readonly userFilter = signal('all');
  /** Score filter value. */
  /* istanbul ignore next */
  readonly scoreFilter = signal('all');
  /** SQL presence filter value. */
  /* istanbul ignore next */
  readonly sqlFilter = signal('all');
  /** Source filter value. */
  /* istanbul ignore next */
  readonly sourceFilter = signal('all');

  /** Table column order. */
  readonly displayedColumns = ['query', 'sql', 'llm', 'source', 'user', 'score', 'time'];

  /** Available model labels derived from the dataset. */
  /* istanbul ignore next */
  readonly models = computed(() => {
    const unique = new Set(
      this.rows()
        .map((r) => r.llm)
        .filter(Boolean),
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  });

  /** Available user emails derived from the dataset. */
  /* istanbul ignore next */
  readonly users = computed(() => {
    const unique = new Set(
      this.rows()
        .map((r) => r.user_email)
        .filter(Boolean),
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  });

  /** Rows filtered by the active filters and search text. */
  /* istanbul ignore next */
  readonly filteredRows = computed(() => {
    const search = this.searchText().toLowerCase().trim();
    const model = this.modelFilter();
    const user = this.userFilter();
    const score = this.scoreFilter();
    const sql = this.sqlFilter();
    const source = this.sourceFilter();

    return this.rows().filter((row) => {
      if (model !== 'all' && row.llm !== model) return false;
      if (user !== 'all' && row.user_email !== user) return false;
      if (source !== 'all' && row.source !== source) return false;
      if (score === 'selected' && !row.is_selected) return false;
      if (score === 'unselected' && row.is_selected) return false;
      const hasSql = !!(row.sql_snippet || '').trim();
      if (sql === 'with_sql' && !hasSql) return false;
      if (sql === 'no_sql' && hasSql) return false;
      if (!search) return true;

      const haystack = [
        row.query_text || '',
        row.sql_snippet || '',
        row.llm || '',
        row.user_email || '',
        row.conversation_title || '',
        row.prompt_strategy || '',
        row.source || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  });

  /** Summary metrics for the filtered dataset. */
  /* istanbul ignore next */
  readonly summary = computed(() => {
    const rows = this.filteredRows();
    const totalCandidates = rows.length;
    const totalQueries = new Set(rows.map((r) => r.assistant_message_id)).size;
    const totalUsers = new Set(rows.map((r) => r.user_id)).size;
    const totalModels = new Set(rows.map((r) => r.llm)).size;
    const selected = rows.filter((r) => r.is_selected).length;
    const withSql = rows.filter((r) => (r.sql_snippet || '').trim()).length;
    const selectionRate = totalCandidates ? Math.round((selected / totalCandidates) * 100) : 0;
    const sqlCoverage = totalCandidates ? Math.round((withSql / totalCandidates) * 100) : 0;

    return {
      totalCandidates,
      totalQueries,
      totalUsers,
      totalModels,
      selected,
      selectionRate,
      sqlCoverage,
    };
  });

  /** Creates a new AnalyticsComponent. */
  constructor() {
    effect(() => {
      const filtered = this.filteredRows();
      const selected = this.selectedRow();

      if (filtered.length === 0) {
        if (selected) this.selectedRow.set(null);
        return;
      }

      if (!selected || !filtered.some((r) => r.candidate_id === selected.candidate_id)) {
        this.selectedRow.set(filtered[0]);
      }
    });
  }

  /** Ng On Init. */
  ngOnInit(): void {
    this.load();
  }

  /** Loads analytics data. */
  load(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.analyticsApi
      .listLlmOutputs()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          if (!this.selectedRow() && rows.length) this.selectedRow.set(rows[0]);
        },
        error: (err) => {
          console.error(err);
          this.error.set('Failed to load analytics. Please try again.');
        },
      });
  }

  /** Clears filters. */
  clearFilters(): void {
    this.searchText.set('');
    this.modelFilter.set('all');
    this.userFilter.set('all');
    this.scoreFilter.set('all');
    this.sqlFilter.set('all');
    this.sourceFilter.set('all');
  }

  /** Selects a row. */
  selectRow(row: LlmAnalyticsRow): void {
    this.selectedRow.set(row);
  }

  /** Score label. */
  scoreLabel(row: LlmAnalyticsRow): string {
    return row.is_selected ? 'Selected' : 'Not selected';
  }

  /** Source label. */
  sourceLabel(row: LlmAnalyticsRow): string {
    return row.source === 'ai' ? 'AI Arena' : 'Chat Arena';
  }
}
