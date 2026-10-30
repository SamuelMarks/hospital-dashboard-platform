/**
 * @fileoverview Benchmarks service delegating to the generated OpenAPI `BenchmarksService`.
 */

import { Service, inject } from '@angular/core';
import { BenchmarksService as GeneratedBenchmarksService } from '../api-client';
import { Observable } from 'rxjs';

/**
 * Metadata header object optionally present in benchmark JSON datasets.
 */
export interface BenchmarkMeta {
  /** Dataset schema version or description. */
  version?: string | null;
  /** Optional description of the benchmark suite. */
  description?: string | null;
  /** Additional metadata properties. */
  [key: string]: unknown;
}

/**
 * Gold-standard Text-to-SQL benchmark entry returned by `/api/v1/benchmarks/sql`.
 */
export interface SqlBenchmark {
  /** Clinical analytics theme name. */
  theme?: string | null;
  /** Natural language analytics question. */
  question?: string | null;
  /** Complexity rating (`Easy`, `Medium`, `Hard`). */
  complexity?: string | null;
  /** Ground-truth DuckDB SQL query. */
  gold_sql?: string | null;
  /** Optional metadata header entry. */
  _meta?: BenchmarkMeta | null;
}

/**
 * Hospital Operations Optimization benchmark scenario returned by `/api/v1/benchmarks/optimization`.
 */
export interface OptimizationBenchmark {
  /** Unique benchmark scenario identifier. */
  id?: string | null;
  /** Clinical optimization use case (`service_unit`, `surgical_scheduling`, `staffing_optimization`). */
  use_case?: string | null;
  /** Partner hospital institution profile identifier. */
  institution_id?: string | null;
  /** Scenario theme category. */
  theme?: string | null;
  /** Complexity rating (`Low`, `Medium`, `High`). */
  complexity?: string | null;
  /** Natural language clinical optimization prompt. */
  prompt?: string | null;
  /** Expert-attained DES baseline metrics dictionary. */
  expert_baseline_metrics?: Record<string, number> | null;
}

/**
 * Service providing typed access to SQL and Hospital Optimization benchmark datasets via the generated OpenAPI client.
 */
@Service()
export class BenchmarksService {
  /** Injected generated OpenAPI benchmarks service. */
  private readonly api = inject(GeneratedBenchmarksService);

  /**
   * Fetches the gold-standard Text-to-SQL benchmark dataset.
   *
   * @returns Observable emitting the array of `SqlBenchmark` items.
   */
  getSqlBenchmarks(): Observable<SqlBenchmark[]> {
    return this.api.getSqlBenchmarksApiV1BenchmarksSqlGet();
  }

  /**
   * Fetches the Hospital Operations Optimization benchmark scenarios across Use Cases 1, 2, and 3.
   *
   * @returns Observable emitting the array of `OptimizationBenchmark` items.
   */
  getOptimizationBenchmarks(): Observable<OptimizationBenchmark[]> {
    return this.api.getOptimizationBenchmarksApiV1BenchmarksOptimizationGet();
  }
}
