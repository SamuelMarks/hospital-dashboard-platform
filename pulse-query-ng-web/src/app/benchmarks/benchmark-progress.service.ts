/**
 * @fileoverview Service providing real-time Server-Sent Events (SSE) telemetry
 * for active LLM benchmark evaluations.
 */

import { Injectable, inject, NgZone, signal } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Live benchmark execution progress payload streamed from the server.
 */
export interface BenchmarkProgress {
  /** Whether benchmark evaluation is currently active. */
  active: boolean;
  /** Count of completed benchmark evaluations. */
  completed: number;
  /** Total count of benchmarks scheduled in the test suite. */
  total: number;
  /** Model identifier currently being evaluated. */
  current_model: string;
  /** Current execution status or phase description. */
  status: string;
  /** Estimated seconds remaining until suite completion. */
  eta_seconds: number;
}

/**
 * Service managing EventSource connections to the benchmark progress stream.
 */
@Injectable({
  providedIn: 'root',
})
export class BenchmarkProgressService {
  /** Angular NgZone for scheduling UI updates from SSE callbacks. */
  private readonly ngZone = inject(NgZone);

  /** Active EventSource instance. */
  private eventSource: EventSource | null = null;

  /** Signal exposing the latest received benchmark progress snapshot. */
  readonly progress = signal<BenchmarkProgress | null>(null);

  /**
   * Connects to the SSE endpoint and streams live benchmark progress updates.
   *
   * @param streamUrl Optional custom URL for the progress SSE stream.
   * @returns Observable emitting [BenchmarkProgress] payloads.
   */
  connect(streamUrl = '/api/v1/benchmarks/progress'): Observable<BenchmarkProgress> {
    return new Observable<BenchmarkProgress>((observer) => {
      this.disconnect();

      const es = new EventSource(streamUrl);
      this.eventSource = es;

      es.onmessage = (event: MessageEvent) => {
        try {
          const data: BenchmarkProgress = JSON.parse(event.data);
          this.ngZone.run(() => {
            this.progress.set(data);
            observer.next(data);
          });
        } catch {
          // Ignore parse errors on keep-alive or heartbeat frames
        }
      };

      es.onerror = (err) => {
        this.ngZone.run(() => {
          observer.error(err);
        });
      };

      return () => {
        this.disconnect();
      };
    });
  }

  /**
   * Closes active EventSource connection and resets state.
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
