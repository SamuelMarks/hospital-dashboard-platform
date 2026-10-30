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

import { BenchmarksService, SqlBenchmark, OptimizationBenchmark } from './benchmarks.service';
import { BenchmarkProgressService } from './benchmark-progress.service';
import { SqlSnippetComponent } from '../chat/conversation/sql-snippet.component';

/**
 * Component providing exploration of gold-standard text-to-SQL and Hospital Operations Optimization
 * benchmark datasets along with real-time SSE progress tracking during active evaluation runs.
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
  /** Parsed Hospital Operations Optimization benchmark scenario items. */
  readonly optimizationBenchmarks = signal<OptimizationBenchmark[]>([]);

  /** Valid text-to-SQL benchmark count. */
  readonly sqlCount = signal<number>(0);
  /** Valid optimization benchmark count. */
  readonly optimizationCount = signal<number>(0);

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
      optimization: this.benchmarksService.getOptimizationBenchmarks(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ sql, optimization }) => {
          this.sqlBenchmarks.set(sql);
          this.sqlCount.set(sql.filter((s) => s.question).length);

          this.optimizationBenchmarks.set(optimization);
          this.optimizationCount.set(optimization.length);
        },
        error: (err: { message?: string }) => {
          this.error.set(err.message || $localize`Failed to load benchmarks.`);
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
   * Navigates to the Hospital Optimization Copilot pre-filled with the selected benchmark prompt and use case.
   *
   * @param item Selected optimization benchmark scenario item.
   */
  launchOptimizationScenario(item: OptimizationBenchmark): void {
    this.router.navigate(['/optimization'], {
      queryParams: {
        prompt: item.prompt,
        useCase: item.use_case ?? 'service_unit',
      },
    });
  }
}
