/**
 * @fileoverview Benchmarks service delegating to the generated OpenAPI `BenchmarksService`.
 */

import { Injectable, inject } from '@angular/core';
import { BenchmarksService as GeneratedBenchmarksService } from '../api-client';
import { Observable } from 'rxjs';

/**
 * Gold-standard Text-to-SQL benchmark entry returned by `/api/v1/benchmarks/sql`.
 */
export interface SqlBenchmark {
  /** Clinical analytics theme name. */
  theme?: string;
  /** Natural language analytics question. */
  question?: string;
  /** Complexity rating (`Easy`, `Medium`, `Hard`). */
  complexity?: string;
  /** Ground-truth DuckDB SQL query. */
  gold_sql?: string;
  /** Optional metadata header entry. */
  _meta?: unknown;
}

/**
 * Parameterized MPAX What-If benchmark scenario returned by `/api/v1/benchmarks/mpax`.
 */
export interface MpaxBenchmark {
  /** Unique benchmark scenario UUID. */
  id?: string;
  /** Scenario theme category. */
  theme?: string;
  /** Complexity rating (`Medium`, `High`). */
  complexity?: string;
  /** Natural language clinical optimization prompt. */
  prompt?: string;
  /** Structured service demand records. */
  demand_data?: unknown[];
  /** Baseline unit bed capacities. */
  base_capacity?: Record<string, number>;
  /** Expected total demand, capacity, and overflow metrics. */
  expected_metrics?: Record<string, number>;
}

/**
 * Service providing typed access to SQL and MPAX benchmark datasets via the generated OpenAPI client.
 */
@Injectable({
  providedIn: 'root',
})
export class BenchmarksService {
  /** Injected generated OpenAPI benchmarks service. */
  private readonly api = inject(GeneratedBenchmarksService);

  /**
   * Fetches the gold-standard Text-to-SQL benchmark dataset.
   *
   * @returns Observable emitting the array of `SqlBenchmark` items.
   */
  getSqlBenchmarks(): Observable<SqlBenchmark[]> {
    return this.api.getSqlBenchmarksApiV1BenchmarksSqlGet() as Observable<SqlBenchmark[]>;
  }

  /**
   * Fetches the MPAX What-If optimization benchmark scenarios.
   *
   * @returns Observable emitting the array of `MpaxBenchmark` items.
   */
  getMpaxBenchmarks(): Observable<MpaxBenchmark[]> {
    return this.api.getMpaxBenchmarksApiV1BenchmarksMpaxGet() as Observable<MpaxBenchmark[]>;
  }
}
