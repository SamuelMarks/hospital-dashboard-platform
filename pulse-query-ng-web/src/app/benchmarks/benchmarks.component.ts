/**
 * @fileoverview Component rendering benchmark scenarios and real-time execution progress telemetry.
 */

import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { BenchmarksService, SqlBenchmark, MpaxBenchmark } from './benchmarks.service';
import { BenchmarkProgressService } from './benchmark-progress.service';
import { SqlSnippetComponent } from '../chat/conversation/sql-snippet.component';

/**
 * Component providing exploration of gold-standard text-to-SQL and MPAX benchmark datasets
 * along with real-time SSE progress tracking during active evaluation runs.
 */
@Component({
  selector: 'app-benchmarks',
  imports: [
    MatCardModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatIconModule,
    SqlSnippetComponent,
  ],
  templateUrl: './benchmarks.component.html',
  styles: [
    `
      .benchmarks-container {
        padding: 24px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .header {
        margin-bottom: 24px;
      }
      .progress-card {
        margin-bottom: 20px;
        border-left: 4px solid var(--sys-primary);
      }
    `,
  ],
})
export class BenchmarksComponent implements OnInit, OnDestroy {
  /** Injected benchmark data service. */
  private readonly benchmarksService = inject(BenchmarksService);
  /** Injected SSE benchmark progress tracker service. */
  private readonly progressService = inject(BenchmarkProgressService);
  /** Injected Angular router instance. */
  private readonly router = inject(Router);

  /** Active SSE stream subscription. */
  private progressSub?: Subscription;

  /** Loading state flag while fetching benchmark scenarios. */
  readonly loading = signal<boolean>(true);
  /** Error message banner content. */
  readonly error = signal<string | null>(null);

  /** Parsed SQL benchmark scenario items. */
  readonly sqlBenchmarks = signal<SqlBenchmark[]>([]);
  /** Parsed MPAX benchmark scenario items. */
  readonly mpaxBenchmarks = signal<MpaxBenchmark[]>([]);

  /** Valid text-to-SQL benchmark count. */
  readonly sqlCount = signal<number>(0);
  /** Valid MPAX benchmark count. */
  readonly mpaxCount = signal<number>(0);

  /** Signal exposing live benchmark progress telemetry. */
  readonly progress = this.progressService.progress;

  /** Computed percentage of completed benchmarks. */
  readonly progressPercent = computed<number>(() => {
    const p = this.progress();
    if (!p || p.total <= 0) return 0;
    return Math.min(100, Math.round((p.completed / p.total) * 100));
  });

  /**
   * Initializes component by loading datasets and establishing progress SSE listener.
   */
  ngOnInit(): void {
    this.progressSub = this.progressService.connect().subscribe({
      error: () => {
        // SSE stream connection errors are handled non-blockingly
      },
    });

    forkJoin({
      sql: this.benchmarksService.getSqlBenchmarks(),
      mpax: this.benchmarksService.getMpaxBenchmarks(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ sql, mpax }) => {
          this.sqlBenchmarks.set(sql);
          this.sqlCount.set(sql.filter((s) => s.question).length);

          this.mpaxBenchmarks.set(mpax);
          this.mpaxCount.set(mpax.length);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load benchmarks.');
        },
      });
  }

  /**
   * Cleans up SSE subscription when navigating away from the view.
   */
  ngOnDestroy(): void {
    this.progressSub?.unsubscribe();
    this.progressService.disconnect();
  }

  /**
   * Navigates to the MPAX Arena pre-filled with the selected benchmark prompt.
   *
   * @param item Selected MPAX benchmark scenario item.
   */
  simulateMpax(item: MpaxBenchmark): void {
    this.router.navigate(['/mpax-arena'], { queryParams: { prompt: item.prompt } });
  }
}
