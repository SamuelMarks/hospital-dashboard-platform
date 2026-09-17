/**
 * @fileoverview MPAX Arena Component.
 * Enables interactive model evaluation comparing LLM solutions against MPAX solver outputs.
 */

import { Component, inject, signal, OnInit } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
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

/**
 * Component orchestrating the MPAX Model Competition Arena.
 *
 * Facilitates submitting clinical optimization prompts across different evaluation modes
 * (judge, translator, constraints, sql_vs_mpax, critic) and reviewing candidate solutions.
 */
@Component({
  selector: 'app-mpax-arena',
  imports: [
    JsonPipe,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    VizMarkdownComponent,
    SqlSnippetComponent,
  ],
  templateUrl: './mpax-arena.component.html',
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
export class MpaxArenaComponent implements OnInit {
  /** API client service for dispatching arena runs. */
  private readonly api = inject(MpaxArenaService);

  /** Active activated route for inspecting scenario query parameters. */
  private readonly route = inject(ActivatedRoute);

  /** Active clinical scenario prompt submitted to the competition. */
  readonly prompt = signal<string>(
    'We have 15 incoming Cardiac patients and 10 MedSurg beds, 2 ICU beds. Where should they go to minimize overflow?',
  );

  /** Selected evaluation mode for the arena execution. */
  readonly mode = signal<string>('judge');

  /** Flag indicating whether an arena evaluation is currently running. */
  readonly isLoading = signal<boolean>(false);

  /** Error message string if the execution encountered a failure. */
  readonly error = signal<string | null>(null);

  /** Parsed evaluation response from the backend service. */
  readonly result = signal<MpaxArenaResponse | null>(null);

  /** Signal tracking ID of candidate currently being voted on. */
  readonly votingCandidateId = signal<string | null>(null);

  /**
   * Initializes component and inspects route query parameters for pre-filled prompts or modes.
   */
  ngOnInit(): void {
    const queryPrompt = this.route.snapshot.queryParamMap.get('prompt');
    if (queryPrompt) {
      this.prompt.set(queryPrompt);
    }
    const queryMode = this.route.snapshot.queryParamMap.get('mode');
    if (queryMode) {
      this.mode.set(queryMode);
    }
  }

  /**
   * Casts a winning vote for a candidate in the active experiment.
   *
   * @param candidateId Unique ID of the candidate to vote for.
   */
  vote(candidateId: string): void {
    const currentResult = this.result();
    if (!currentResult) return;

    this.votingCandidateId.set(candidateId);
    this.api
      .voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost(
        currentResult.experiment_id,
        candidateId,
      )
      .pipe(finalize(() => this.votingCandidateId.set(null)))
      .subscribe({
        next: (updated: MpaxArenaResponse) => this.result.set(updated),
        error: (err: unknown) => {
          this.error.set(this.extractError(err, 'Voting failed'));
        },
      });
  }

  /**
   * Executes the MPAX arena competition with the current prompt and mode configuration.
   */
  run(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.result.set(null);

    this.api
      .runMpaxArenaModeApiV1MpaxArenaRunPost({
        prompt: this.prompt(),
        mode: this.mode(),
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res: MpaxArenaResponse) => this.result.set(res),
        error: (err: unknown) => {
          this.error.set(this.extractError(err, 'Arena failed'));
        },
      });
  }

  /**
   * Extracts clean error diagnostics from an HTTP or runtime exception.
   *
   * @param err Unknown caught exception object.
   * @param fallback Default text message to present if error details cannot be parsed.
   * @returns Formatted error string for display.
   */
  private extractError(err: unknown, fallback: string): string {
    if (err && typeof err === 'object') {
      const httpErr = err as HttpErrorResponse;
      if (httpErr.error && typeof httpErr.error === 'object' && 'detail' in httpErr.error) {
        return String(httpErr.error.detail);
      }
      if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
        const msg = (err as { message: string }).message;
        if (msg.trim().length > 0) {
          return msg;
        }
      }
    }
    return fallback;
  }
}
