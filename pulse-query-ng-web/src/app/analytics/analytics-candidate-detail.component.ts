/**
 * @fileoverview Candidate detail pane subcomponent for `AnalyticsComponent`.
 *
 * Displays full metadata, prompt strategy, selection status, and captured SQL
 * for the currently selected LLM Arena candidate row.
 */

import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';

import { LlmAnalyticsRow } from './analytics.service';

/**
 * Detail inspection panel for a selected `LlmAnalyticsRow` in the Analytics view.
 */
@Component({
  selector: 'app-analytics-candidate-detail',
  imports: [DatePipe, MatCardModule],
  template: `
    <mat-card class="detail-card">
      @if (selectedRow(); as row) {
        <div class="detail-header">
          <h3 i18n>Candidate Detail</h3>
          <div class="status-row">
            <span class="status-dot" [class.active]="row.is_selected" aria-hidden="true"></span>
            {{ scoreLabel(row) }}
          </div>
        </div>

        <div class="detail-section">
          <div i18n class="detail-label">Query</div>
          <div class="detail-value">
            @if (row.query_text) {
              {{ row.query_text }}
            } @else {
              <span i18n>Unknown query</span>
            }
          </div>
        </div>

        <div class="detail-section">
          <div i18n class="detail-label">Conversation</div>
          <div class="detail-value">
            @if (row.conversation_title) {
              {{ row.conversation_title }}
            } @else if (row.source === 'ai') {
              <span i18n>AI Arena Experiment</span>
            } @else {
              <span i18n>Unknown conversation</span>
            }
          </div>
        </div>

        <div class="detail-section">
          <div i18n class="detail-label">User</div>
          <div class="detail-value">{{ row.user_email }}</div>
        </div>

        <div class="detail-section">
          <div i18n class="detail-label">LLM</div>
          <div class="detail-value">{{ row.llm }}</div>
        </div>

        <div class="detail-section">
          <div i18n class="detail-label">Source</div>
          <div class="detail-value">{{ sourceLabel(row) }}</div>
        </div>

        @if (row.prompt_strategy) {
          <div class="detail-section">
            <div i18n class="detail-label">Prompt Strategy</div>
            <div class="detail-value">{{ row.prompt_strategy }}</div>
          </div>
        }

        <div class="detail-section">
          <div i18n class="detail-label">Score</div>
          <div class="detail-value">
            @if (row.is_selected) {
              <span i18n>1 (Selected)</span>
            } @else {
              <span i18n>0 (Not selected)</span>
            }
          </div>
        </div>

        <div class="detail-section">
          <div i18n class="detail-label">Timestamp</div>
          <div class="detail-value">{{ row.created_at | date: 'full' }}</div>
        </div>

        <div class="detail-section">
          <div i18n class="detail-label">SQL</div>
          @if (row.sql_snippet) {
            <pre class="sql-block">{{ row.sql_snippet }}</pre>
          } @else {
            <pre i18n class="sql-block">No SQL snippet captured.</pre>
          }
        </div>
      } @else {
        <div i18n class="empty-state">Select a row to inspect the full SQL and metadata.</div>
      }
    </mat-card>
  `,
  styles: [
    `
      :host {
        display: block;
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
    `,
  ],
})
export class AnalyticsCandidateDetailComponent {
  /** Currently selected analytics row, or `null` when no row is selected. */
  readonly selectedRow = input<LlmAnalyticsRow | null>(null);

  /**
   * Formats the selection score label for a row.
   *
   * @param row - The analytics row to inspect.
   * @returns Human-readable selection status label.
   */
  scoreLabel(row: LlmAnalyticsRow): string {
    return row.is_selected ? $localize`Selected` : $localize`Not selected`;
  }

  /**
   * Formats the arena source label for a row.
   *
   * @param row - The analytics row to inspect.
   * @returns Human-readable arena source label.
   */
  sourceLabel(row: LlmAnalyticsRow): string {
    return row.source === 'ai' ? $localize`AI Arena` : $localize`Chat Arena`;
  }
}
