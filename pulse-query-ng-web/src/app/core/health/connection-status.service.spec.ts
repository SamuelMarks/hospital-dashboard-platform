/**
 * @fileoverview Unit tests for ConnectionStatusService.
 */

import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  ConnectionStatusService,
  SystemHealthResponse,
  SystemDiagnosticsResponse,
  ReingestResponse,
} from './connection-status.service';

describe('ConnectionStatusService', () => {
  let service: ConnectionStatusService;
  let httpMock: HttpTestingController;
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  const mockHealthSuccess: SystemHealthResponse = {
    overall_status: 'healthy',
    timestamp: '2026-09-06T00:00:00Z',
    postgres: {
      status: 'connected',
      latency_ms: 1.5,
      details: 'Postgres OK',
      error: null,
    },
    duckdb: {
      status: 'ready',
      path: 'data.duckdb',
      tables: { hospital_data: 1000 },
      total_tables: 1,
      error: null,
    },
    data: {
      has_default_data: true,
      fallback_generated: false,
      missing_files: [],
      row_counts: { hospital_data: 1000 },
    },
    templates: {
      templates_loaded: 10,
      has_templates: true,
      missing_file: false,
    },
    llm: {
      providers_count: 1,
      mock_mode: false,
      models: ['GPT-4o'],
    },
    warnings: [],
  };

  beforeEach(() => {
    mockDialog = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: mockDialog },
      ],
    });

    service = TestBed.inject(ConnectionStatusService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.cancelRetryCountdown();
    httpMock.verify();
  });

  it('should initialize with default healthy and online signals', () => {
    expect(service.isOnline()).toBe(true);
    expect(service.isBackendReachable()).toBe(true);
    expect(service.overallStatus()).toBe('healthy');
    expect(service.isChecking()).toBe(false);
  });

  it('should handle successful checkHealth response', () => {
    service.checkHealth().subscribe((res) => {
      expect(res).toEqual(mockHealthSuccess);
    });

    const req = httpMock.expectOne('/api/v1/system/health');
    expect(req.request.method).toBe('GET');
    req.flush(mockHealthSuccess);

    expect(service.isBackendReachable()).toBe(true);
    expect(service.isDatabaseHealthy()).toBe(true);
    expect(service.overallStatus()).toBe('healthy');
    expect(service.healthData()).toEqual(mockHealthSuccess);
  });

  it('should handle checkHealth with failing database status and missing warnings', () => {
    const unhealthyPayload: any = {
      overall_status: 'critical',
      timestamp: '2026-09-06T00:00:00Z',
      postgres: { status: 'error' },
      duckdb: { status: 'error' },
    };

    service.checkHealth().subscribe();
    const req = httpMock.expectOne('/api/v1/system/health');
    req.flush(unhealthyPayload);

    expect(service.isDatabaseHealthy()).toBe(false);
    expect(service.overallStatus()).toBe('critical');
    expect(service.activeWarnings()).toEqual([]);
  });

  it('should handle failed checkHealth and mark backend unreachable', () => {
    service.checkHealth().subscribe((res) => {
      expect(res).toBeNull();
    });

    const req = httpMock.expectOne('/api/v1/system/health');
    req.error(new ProgressEvent('Network error'));

    expect(service.isBackendReachable()).toBe(false);
    expect(service.isDatabaseHealthy()).toBe(false);
    expect(service.overallStatus()).toBe('unreachable');
    expect(service.reconnectCountdown()).toBeGreaterThan(0);
  });

  it('should decrement countdown timer and trigger checkHealth on 0', () => {
    vi.useFakeTimers();
    service.startRetryCountdown(2);
    expect(service.reconnectCountdown()).toBe(2);

    vi.advanceTimersByTime(1000);
    expect(service.reconnectCountdown()).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(service.reconnectCountdown()).toBe(0);

    const req = httpMock.expectOne('/api/v1/system/health');
    req.flush(mockHealthSuccess);
    vi.useRealTimers();
  });

  it('should support startRetryCountdown with default 10 seconds', () => {
    service.startRetryCountdown();
    expect(service.reconnectCountdown()).toBe(10);
    service.cancelRetryCountdown();
  });

  it('should query getDiagnostics endpoint', () => {
    const mockDiag: SystemDiagnosticsResponse = {
      health: mockHealthSuccess,
      environment_checks: {},
      troubleshooting_guides: [],
    };

    service.getDiagnostics().subscribe((res) => {
      expect(res).toEqual(mockDiag);
    });

    const req = httpMock.expectOne('/api/v1/system/diagnostics');
    expect(req.request.method).toBe('GET');
    req.flush(mockDiag);
  });

  it('should trigger reingest and refresh health status', () => {
    const mockReingest: ReingestResponse = {
      success: true,
      message: 'Ingestion complete',
      tables: { hospital_data: 500 },
    };

    service.triggerReingest().subscribe((res) => {
      expect(res).toEqual(mockReingest);
    });

    const req = httpMock.expectOne('/api/v1/system/reingest');
    expect(req.request.method).toBe('POST');
    req.flush(mockReingest);

    const healthReq = httpMock.expectOne('/api/v1/system/health');
    healthReq.flush(mockHealthSuccess);
  });

  it('should dismiss warning banner', () => {
    expect(service.isDismissed()).toBe(false);
    service.dismissWarningBanner();
    expect(service.isDismissed()).toBe(true);
  });

  it('should open diagnostics dialog asynchronously', async () => {
    await service.openDiagnosticsDialog();
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('should update online status on browser events', () => {
    window.dispatchEvent(new Event('offline'));
    expect(service.isOnline()).toBe(false);
    expect(service.overallStatus()).toBe('unreachable');

    window.dispatchEvent(new Event('online'));
    expect(service.isOnline()).toBe(true);
    const req = httpMock.expectOne('/api/v1/system/health');
    req.flush(mockHealthSuccess);
  });
});
