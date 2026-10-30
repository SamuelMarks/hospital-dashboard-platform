/**
 * @fileoverview Unit tests for `BenchmarksService`.
 */

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, type Mock } from 'vitest';
import { BenchmarksService, OptimizationBenchmark, SqlBenchmark } from './benchmarks.service';
import { BenchmarksService as GeneratedBenchmarksService } from '../api-client';

describe('BenchmarksService', () => {
  let service: BenchmarksService;
  let mockApi: {
    getSqlBenchmarksApiV1BenchmarksSqlGet: Mock;
    getOptimizationBenchmarksApiV1BenchmarksOptimizationGet: Mock;
  };

  beforeEach(() => {
    mockApi = {
      getSqlBenchmarksApiV1BenchmarksSqlGet: vi.fn(),
      getOptimizationBenchmarksApiV1BenchmarksOptimizationGet: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [BenchmarksService, { provide: GeneratedBenchmarksService, useValue: mockApi }],
    });
    service = TestBed.inject(BenchmarksService);
  });

  it('should fetch sql benchmarks via generated BenchmarksService', () => {
    const dummy: SqlBenchmark[] = [{ theme: 'T1', question: 'Q1', gold_sql: 'SELECT 1' }];
    mockApi.getSqlBenchmarksApiV1BenchmarksSqlGet.mockReturnValue(of(dummy));

    service.getSqlBenchmarks().subscribe((res) => {
      expect(res).toEqual(dummy);
    });

    expect(mockApi.getSqlBenchmarksApiV1BenchmarksSqlGet).toHaveBeenCalledOnce();
  });

  it('should fetch optimization benchmarks via generated BenchmarksService', () => {
    const dummy: OptimizationBenchmark[] = [
      { id: 'opt-uc1-001', use_case: 'service_unit', theme: 'Service-Unit Reassignment' },
    ];
    mockApi.getOptimizationBenchmarksApiV1BenchmarksOptimizationGet.mockReturnValue(of(dummy));

    service.getOptimizationBenchmarks().subscribe((res) => {
      expect(res).toEqual(dummy);
    });

    expect(mockApi.getOptimizationBenchmarksApiV1BenchmarksOptimizationGet).toHaveBeenCalledOnce();
  });
});
