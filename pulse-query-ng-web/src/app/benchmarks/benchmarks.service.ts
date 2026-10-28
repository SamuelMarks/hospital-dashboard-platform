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
 * Service demand row entry within an MPAX benchmark scenario.
 */
export interface DemandDataRow {
  /** Clinical service name. */
  Service: string;
  /** Patient demand count for the service. */
  Count: number;
  /** Optional current unit name when 3-column demand is used. */
  Unit?: string | null;
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
 * Expected solver metrics summary for an MPAX benchmark scenario.
 */
export interface MpaxExpectedMetrics {
  /** Expected total patient demand. */
  total_demand?: number;
  /** Expected total bed capacity. */
  total_capacity?: number;
  /** Expected patient overflow count. */
  expected_overflow?: number;
  /** Whether the scenario is feasible without overflow. */
  is_feasible?: boolean;
  /** Additional numeric metric entries. */
  [key: string]: number | boolean | undefined;
}

/**
 * Parameterized MPAX What-If benchmark scenario returned by `/api/v1/benchmarks/mpax`.
 */
export interface MpaxBenchmark {
  /** Unique benchmark scenario UUID. */
  id?: string | null;
  /** Scenario theme category. */
  theme?: string | null;
  /** Complexity rating (`Medium`, `High`). */
  complexity?: string | null;
  /** Natural language clinical optimization prompt. */
  prompt?: string | null;
  /** Structured service demand records. */
  demand_data?: DemandDataRow[] | null;
  /** Baseline unit bed capacities. */
  base_capacity?: Record<string, number> | null;
  /** Expected total demand, capacity, and overflow metrics. */
  expected_metrics?: MpaxExpectedMetrics | null;
}

/**
 * Service providing typed access to SQL and MPAX benchmark datasets via the generated OpenAPI client.
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
   * Fetches the MPAX What-If optimization benchmark scenarios.
   *
   * @returns Observable emitting the array of `MpaxBenchmark` items.
   */
  getMpaxBenchmarks(): Observable<MpaxBenchmark[]> {
    return this.api.getMpaxBenchmarksApiV1BenchmarksMpaxGet();
  }
}
