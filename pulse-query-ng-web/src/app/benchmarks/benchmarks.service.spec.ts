/**
 * @fileoverview Unit tests for `BenchmarksService`.
 */

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, type Mock } from 'vitest';
import { BenchmarksService, MpaxBenchmark, SqlBenchmark } from './benchmarks.service';
import { BenchmarksService as GeneratedBenchmarksService } from '../api-client';

describe('BenchmarksService', () => {
  let service: BenchmarksService;
  let mockApi: {
    getSqlBenchmarksApiV1BenchmarksSqlGet: Mock;
    getMpaxBenchmarksApiV1BenchmarksMpaxGet: Mock;
  };

  beforeEach(() => {
    mockApi = {
      getSqlBenchmarksApiV1BenchmarksSqlGet: vi.fn(),
      getMpaxBenchmarksApiV1BenchmarksMpaxGet: vi.fn(),
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

  it('should fetch mpax benchmarks via generated BenchmarksService', () => {
    const dummy: MpaxBenchmark[] = [{ id: '1', theme: 'Surge' }];
    mockApi.getMpaxBenchmarksApiV1BenchmarksMpaxGet.mockReturnValue(of(dummy));

    service.getMpaxBenchmarks().subscribe((res) => {
      expect(res).toEqual(dummy);
    });

    expect(mockApi.getMpaxBenchmarksApiV1BenchmarksMpaxGet).toHaveBeenCalledOnce();
  });
});
