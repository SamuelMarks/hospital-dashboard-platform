/**
 * @fileoverview Unit tests for `DashboardOfflineCacheService`.
 */

import { TestBed } from '@angular/core/testing';
import { DashboardOfflineCacheService } from './dashboard-offline-cache.service';
import { safeStorage } from '../core/storage.utils';
import { DashboardResponse } from '../api-client';

describe('DashboardOfflineCacheService', () => {
  let service: DashboardOfflineCacheService;

  const sampleDashboard: DashboardResponse = {
    id: 'dash-123',
    name: 'Command Center',
    owner_id: 'u1',
    widgets: [],
  };

  beforeEach(() => {
    safeStorage.clear();
    TestBed.configureTestingModule({
      providers: [DashboardOfflineCacheService],
    });
    service = TestBed.inject(DashboardOfflineCacheService);
  });

  afterEach(() => {
    safeStorage.clear();
  });

  it('saves and loads a valid dashboard snapshot', () => {
    const fixedDate = new Date('2026-10-14T12:00:00.000Z');
    service.saveSnapshot(sampleDashboard, { w1: { data: [], columns: [] } }, fixedDate);

    const loaded = service.loadSnapshot('dash-123');
    expect(loaded).toEqual({
      dashboard: sampleDashboard,
      dataMap: { w1: { data: [], columns: [] } },
      savedAt: '2026-10-14T12:00:00.000Z',
    });
  });

  it('uses default Date when now argument is omitted and handles missing optional fields on load', () => {
    service.saveSnapshot(sampleDashboard, {});
    expect(service.loadSnapshot('dash-123')?.dashboard.id).toBe('dash-123');

    safeStorage.setItem(
      'pulse_dashboard_snapshot_dash-partial',
      JSON.stringify({ dashboard: sampleDashboard }),
    );
    expect(service.loadSnapshot('dash-partial')).toEqual({
      dashboard: sampleDashboard,
      dataMap: {},
      savedAt: '',
    });
  });

  it('returns null for missing, malformed, or incomplete snapshots', () => {
    expect(service.loadSnapshot('non-existent')).toBeNull();

    safeStorage.setItem('pulse_dashboard_snapshot_bad-json', '{not-json');
    expect(service.loadSnapshot('bad-json')).toBeNull();

    safeStorage.setItem('pulse_dashboard_snapshot_no-dash', JSON.stringify({ foo: 'bar' }));
    expect(service.loadSnapshot('no-dash')).toBeNull();
  });

  it('clears a saved snapshot', () => {
    service.saveSnapshot(sampleDashboard, {});
    service.clearSnapshot('dash-123');
    expect(service.loadSnapshot('dash-123')).toBeNull();
  });
});
