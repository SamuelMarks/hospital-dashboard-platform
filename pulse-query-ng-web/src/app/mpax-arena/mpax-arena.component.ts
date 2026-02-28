/* v8 ignore start */
/** @docs */
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MpaxArenaService, MpaxArenaResponse } from '../api-client';
import { finalize } from 'rxjs/operators';
import { VizMarkdownComponent } from '../shared/visualizations/viz-markdown/viz-markdown.component';
import { SqlSnippetComponent } from '../chat/conversation/sql-snippet.component';
import { ActivatedRoute } from '@angular/router';

/** @docs */
@Component({
  selector: 'app-mpax-arena',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    VizMarkdownComponent,
    SqlSnippetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mpax-container">
      <div class="header">
        <h1 class="text-2xl font-light mb-1">MPAX vs LLM Arena</h1>
        <p class="text-gray-500">Compare Mathematical Optimization vs Generative AI</p>
      </div>

      <mat-card class="form-panel p-4 mb-6">
        <div class="flex gap-4">
          <mat-form-field appearance="outline" class="flex-grow">
            <mat-label>Scenario Prompt</mat-label>
            <textarea
              matInput
              [(ngModel)]="prompt"
              rows="3"
              placeholder="Describe the scenario..."
            ></textarea>
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-64">
            <mat-label>Evaluation Mode</mat-label>
            <mat-select [(ngModel)]="mode">
              <mat-option value="judge">1. Ground Truth Judge</mat-option>
              <mat-option value="translator">2. Translators</mat-option>
              <mat-option value="constraints">3. Constraint Generation</mat-option>
              <mat-option value="sql_vs_mpax">4. SQL vs MPAX</mat-option>
              <mat-option value="critic">5. Feedback Critic</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <button
          mat-flat-button
          color="primary"
          (click)="run()"
          [disabled]="isLoading() || !prompt.trim()"
        >
          @if (isLoading()) {
            <mat-progress-spinner
              mode="indeterminate"
              diameter="20"
              class="mr-2"
            ></mat-progress-spinner>
          }
          Run Arena
        </button>
      </mat-card>

      @if (error()) {
        <div class="error-box p-4 mb-6 bg-red-100 text-red-800 border-l-4 border-red-500 rounded">
          {{ error() }}
        </div>
      }

      @if (result(); as res) {
        <div class="results-grid">
          @if (res.ground_truth_mpax) {
            <mat-card class="mpax-panel p-4 bg-blue-50 border-blue-200 border">
              <h3 class="font-bold text-blue-900 mb-2">MPAX Ground Truth</h3>
              <pre class="text-xs overflow-auto">{{ res.ground_truth_mpax | json }}</pre>
            </mat-card>
          }

          <div class="candidates-grid mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (cand of res.candidates; track cand.id) {
              <mat-card class="candidate-panel p-4">
                <h3 class="font-bold mb-2">{{ cand.model_name }}</h3>

                @if (cand.mpax_score !== null && cand.mpax_score !== undefined) {
                  <div class="mb-4 p-2 bg-gray-100 rounded">
                    <strong>MPAX Feasibility Score:</strong> {{ cand.mpax_score }}
                  </div>
                }

                @if (cand.sql_snippet) {
                  <app-sql-snippet class="mb-4 block" [sql]="cand.sql_snippet"></app-sql-snippet>
                }

                <viz-markdown [content]="cand.content"></viz-markdown>

                @if (cand.mpax_result) {
                  <div class="mt-4 p-2 bg-gray-50 border rounded">
                    <h4 class="font-bold text-xs text-gray-500 mb-1">Generated MPAX Result</h4>
                    <pre class="text-xs overflow-auto">{{ cand.mpax_result | json }}</pre>
                  </div>
                }
              </mat-card>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .mpax-container {
        padding: 24px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .header {
        margin-bottom: 24px;
      }
    `,
  ],
})
/** @docs */
export class MpaxArenaComponent {
  private readonly api = inject(MpaxArenaService);

  prompt =
    'We have 15 incoming Cardiac patients and 10 MedSurg beds, 2 ICU beds. Where should they go to minimize overflow?';
  mode = 'judge';

  isLoading = signal(false);
  error = signal<string | null>(null);
  result = signal<MpaxArenaResponse | null>(null);

  run() {
    this.isLoading.set(true);
    this.error.set(null);
    this.result.set(null);

    this.api
      .runMpaxArenaApiV1MpaxArenaRunPost({
        prompt: this.prompt,
        mode: this.mode,
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => this.result.set(res),
        error: (err) => this.error.set(err.error?.detail || err.message || 'Arena failed'),
      });
  }
}
