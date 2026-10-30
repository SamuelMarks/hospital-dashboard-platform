/**
 * @fileoverview Unit tests for [BenchmarksComponent].
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi, describe, beforeEach, it, expect, afterEach } from 'vitest';
import { Component, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { BenchmarksComponent } from './benchmarks.component';
import { BenchmarksService } from './benchmarks.service';
import { BenchmarkProgressService, BenchmarkProgress } from './benchmark-progress.service';
import { SqlSnippetComponent } from '../chat/conversation/sql-snippet.component';
import { readTemplate } from '../../test-utils/component-resources';

/** Mock SQL snippet component for unit testing. */
@Component({
  selector: 'app-sql-snippet',
  template: '',
})
class MockSqlSnippetComponent {
  /** SQL input binding. */
  readonly sql = input<string | null | undefined>('');
}

describe('BenchmarksComponent', () => {
  let component: BenchmarksComponent;
  let fixture: ComponentFixture<BenchmarksComponent>;
  let mockService: {
    getSqlBenchmarks: ReturnType<typeof vi.fn>;
    getOptimizationBenchmarks: ReturnType<typeof vi.fn>;
  };
  let mockProgressService: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    progress: ReturnType<typeof signal<BenchmarkProgress | null>>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockService = {
      getSqlBenchmarks: vi
        .fn()
        .mockReturnValue(
          of([
            { _meta: 'ignored' },
            { theme: 'T1', question: 'Q1', complexity: 'Low', gold_sql: 'S1' },
          ]),
        ),
      getOptimizationBenchmarks: vi.fn().mockReturnValue(
        of([
          {
            id: 'opt-uc1-001',
            use_case: 'service_unit',
            institution_id: 'stanford_childrens',
            theme: 'Service-Unit Reassignment',
            prompt: 'Place all Gen Peds on PCU 350',
          },
        ]),
      ),
    };

    mockProgressService = {
      connect: vi.fn().mockReturnValue(of({ active: false })),
      disconnect: vi.fn(),
      progress: signal<BenchmarkProgress | null>(null),
    };

    mockRouter = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [BenchmarksComponent],
      providers: [
        { provide: BenchmarksService, useValue: mockService },
        { provide: BenchmarkProgressService, useValue: mockProgressService },
        { provide: Router, useValue: mockRouter },
      ],
    })
      .overrideComponent(BenchmarksComponent, {
        remove: { imports: [SqlSnippetComponent] },
        add: { imports: [MockSqlSnippetComponent] },
      })
      .overrideComponent(BenchmarksComponent, {
        set: { template: readTemplate('./benchmarks.component.html'), templateUrl: undefined },
      })
      .compileComponents();

    fixture = TestBed.createComponent(BenchmarksComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize and load benchmarks', () => {
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
    expect(component.sqlCount()).toBe(1);
    expect(component.optimizationCount()).toBe(1);
    expect(component.sqlBenchmarks().length).toBe(2);
    expect(mockProgressService.connect).toHaveBeenCalled();
  });

  it('should compute progressPercent correctly', () => {
    fixture.detectChanges();

    expect(component.progressPercent()).toBe(0);

    mockProgressService.progress.set({
      active: true,
      completed: 0,
      total: 0,
      current_model: 'test',
      status: 'idle',
      eta_seconds: 0,
    });
    expect(component.progressPercent()).toBe(0);

    mockProgressService.progress.set({
      active: true,
      completed: 4,
      total: 10,
      current_model: 'gemini-2.5-pro',
      status: 'running',
      eta_seconds: 20,
    });
    expect(component.progressPercent()).toBe(40);
  });

  it('should handle error during load', () => {
    mockService.getSqlBenchmarks.mockReturnValue(throwError(() => new Error('Network error')));
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('Network error');
  });

  it('should navigate on optimization scenario click with explicit and default use_case', () => {
    fixture.detectChanges();
    component.launchOptimizationScenario({
      id: 'opt-uc2-001',
      use_case: 'surgical_scheduling',
      theme: 'POINTS',
      prompt: 'Smooth CVICU admits',
    });
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/optimization'], {
      queryParams: { prompt: 'Smooth CVICU admits', useCase: 'surgical_scheduling' },
    });

    component.launchOptimizationScenario({
      id: 'opt-uc1-default',
      theme: 'Default UC',
      prompt: 'Default prompt',
    });
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/optimization'], {
      queryParams: { prompt: 'Default prompt', useCase: 'service_unit' },
    });
  });

  it('should handle error without message during load', () => {
    mockService.getSqlBenchmarks.mockReturnValue(throwError(() => ({})));
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('Failed to load benchmarks.');
  });

  it('should clean up progress stream on destroy', () => {
    fixture.detectChanges();
    component.ngOnDestroy();

    expect(mockProgressService.disconnect).toHaveBeenCalled();
  });

  it('should gracefully handle SSE connection failure', () => {
    mockProgressService.connect.mockReturnValue(throwError(() => new Error('SSE failed')));
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
  });
});
