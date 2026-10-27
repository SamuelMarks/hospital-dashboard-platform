/**
 * @fileoverview Unit tests for `DashboardFilterPersistenceService`.
 */

import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DashboardFilterPersistenceService } from './dashboard-filter-persistence.service';

describe('DashboardFilterPersistenceService', () => {
  let service: DashboardFilterPersistenceService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [DashboardFilterPersistenceService],
    });
    service = TestBed.inject(DashboardFilterPersistenceService);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('areFiltersEqual compares key counts and shallow values accurately', () => {
    expect(service.areFiltersEqual({}, {})).toBe(true);
    expect(service.areFiltersEqual({ dept: 'ICU' }, { dept: 'ICU' })).toBe(true);
    expect(service.areFiltersEqual({ dept: 'ICU' }, { dept: 'ER' })).toBe(false);
    expect(service.areFiltersEqual({ dept: 'ICU' }, { dept: 'ICU', shift: 'Day' })).toBe(false);
  });

  it('saveFilters, loadFilters, and clearFilters round-trip valid filter values', () => {
    service.saveFilters('dash-1', {
      dept: 'Cardiology',
      limit: 10,
      active: true,
      empty: null,
      units: ['ICU', 'PCU'],
    });

    const loaded = service.loadFilters('dash-1');
    expect(loaded).toEqual({
      dept: 'Cardiology',
      limit: 10,
      active: true,
      empty: null,
      units: ['ICU', 'PCU'],
    });

    service.clearFilters('dash-1');
    expect(service.loadFilters('dash-1')).toEqual({});
  });

  it('handles empty dashboardId, missing storage entries, invalid JSON, non-object JSON, and storage errors', () => {
    service.saveFilters('', { dept: 'ICU' });
    expect(service.loadFilters('')).toEqual({});
    service.clearFilters('');

    expect(service.loadFilters('missing-dash')).toEqual({});

    localStorage.setItem('pulse_dashboard_filters_bad-json', '{corrupt');
    expect(service.loadFilters('bad-json')).toEqual({});

    localStorage.setItem('pulse_dashboard_filters_array-json', '[1, 2, 3]');
    expect(service.loadFilters('array-json')).toEqual({});

    localStorage.setItem(
      'pulse_dashboard_filters_mixed',
      JSON.stringify({
        validStr: 'ok',
        invalidObj: { nested: 1 },
        invalidArr: [1, 2],
      }),
    );
    expect(service.loadFilters('mixed')).toEqual({ validStr: 'ok' });

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => service.saveFilters('dash-err', { dept: 'ICU' })).not.toThrow();
    setSpy.mockRestore();

    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => service.clearFilters('dash-err')).not.toThrow();
    removeSpy.mockRestore();
  });
});
