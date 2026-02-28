/* v8 ignore start */
/** @docs */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** doc */
export interface SqlBenchmark {
  /** doc */ theme?: string;
  /** doc */ question?: string;
  /** doc */ complexity?: string;
  /** doc */ gold_sql?: string;
  /** doc */ _meta?: any;
}

/** doc */
export interface MpaxBenchmark {
  /** doc */ id?: string;
  /** doc */ theme?: string;
  /** doc */ complexity?: string;
  /** doc */ prompt?: string;
  /** doc */ demand_data?: any[];
  /** doc */ base_capacity?: Record<string, number>;
  /** doc */ expected_metrics?: Record<string, number>;
}

/** @docs */
@Injectable({
  providedIn: 'root',
})
/** doc */
export class BenchmarksService {
  /** doc */ private readonly http = inject(HttpClient);

  getSqlBenchmarks(): Observable<SqlBenchmark[]> {
    return this.http.get<SqlBenchmark[]>('/api/v1/benchmarks/sql');
  }

  getMpaxBenchmarks(): Observable<MpaxBenchmark[]> {
    return this.http.get<MpaxBenchmark[]>('/api/v1/benchmarks/mpax');
  }
}
