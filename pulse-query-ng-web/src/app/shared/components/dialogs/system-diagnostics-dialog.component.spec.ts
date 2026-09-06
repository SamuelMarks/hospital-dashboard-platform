/**
 * @fileoverview Unit tests for SystemDiagnosticsDialogComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SystemDiagnosticsDialogComponent } from './system-diagnostics-dialog.component';
import {
  ConnectionStatusService,
  SystemHealthResponse,
  SystemDiagnosticsResponse,
  ReingestResponse,
} from '../../../core/health/connection-status.service';

describe('SystemDiagnosticsDialogComponent', () => {
  let fixture: ComponentFixture<SystemDiagnosticsDialogComponent>;
  let component: SystemDiagnosticsDialogComponent;
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };

  const mockHealthData: SystemHealthResponse = {
    overall_status: 'degraded',
    timestamp: '2026-09-06T00:00:00Z',
    postgres: {
      status: 'connected',
      latency_ms: 2.1,
      details: 'OK',
      error: null,
    },
    duckdb: {
      status: 'ready',
      path: 'data.duckdb',
      tables: { hospital_data: 1200 },
      total_tables: 1,
      error: null,
    },
    data: {
      has_default_data: false,
      fallback_generated: true,
      missing_files: ['hospital_data.csv'],
      row_counts: { hospital_data: 1000 },
    },
    templates: {
      templates_loaded: 5,
      has_templates: true,
      missing_file: false,
    },
    llm: {
      providers_count: 0,
      mock_mode: true,
      models: [],
    },
    warnings: [
      {
        code: 'MISSING_DATA',
        message: 'Sample data active',
        severity: 'warning',
        remediation: 'Ingest data',
        timestamp: '2026-09-06T00:00:00Z',
      },
    ],
  };

  const mockDiagnosticsResponse: SystemDiagnosticsResponse = {
    health: mockHealthData,
    environment_checks: {},
    troubleshooting_guides: [
      {
        title: 'Start Postgres',
        command: 'docker compose up -d postgres',
        description: 'Starts DB container',
      },
    ],
  };

  const mockService = {
    healthData: signal<SystemHealthResponse | null>(mockHealthData),
    overallStatus: signal<'healthy' | 'degraded' | 'critical' | 'unreachable'>('degraded'),
    activeWarnings: signal(mockHealthData.warnings),
    checkHealth: vi.fn().mockReturnValue(of(mockHealthData)),
    getDiagnostics: vi.fn().mockReturnValue(of(mockDiagnosticsResponse)),
    triggerReingest: vi
      .fn()
      .mockReturnValue(of({ success: true, message: 'Ingested', tables: {} } as ReingestResponse)),
  };

  beforeEach(async () => {
    mockSnackBar = { open: vi.fn() };
    mockDialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [SystemDiagnosticsDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: ConnectionStatusService, useValue: mockService },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemDiagnosticsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize and load troubleshooting guides', () => {
    expect(mockService.getDiagnostics).toHaveBeenCalled();
    expect(component.troubleshootingGuides().length).toBe(1);
    expect(component.pgStatus()).toBe('connected');
    expect(component.duckStatus()).toBe('ready');
    expect(component.hasDefaultData()).toBe(false);
    expect(component.isMockLlm()).toBe(true);
  });

  it('should refresh health status on demand', () => {
    component.refresh();
    expect(mockService.checkHealth).toHaveBeenCalled();
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Health status refreshed.',
      'Dismiss',
      expect.any(Object),
    );
  });

  it('should handle reingest success', () => {
    component.reingestData();
    expect(mockService.triggerReingest).toHaveBeenCalled();
    expect(mockSnackBar.open).toHaveBeenCalledWith('Ingested', 'OK', expect.any(Object));
  });

  it('should handle reingest error', () => {
    mockService.triggerReingest.mockReturnValueOnce(throwError(() => new Error('Failed')));
    component.reingestData();
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Dataset re-ingestion failed.',
      'Dismiss',
      expect.any(Object),
    );
  });

  it('should copy command to clipboard', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
    });

    component.copyCommand('docker compose up -d');
    expect(writeTextMock).toHaveBeenCalledWith('docker compose up -d');
  });

  it('should evaluate status descriptions correctly for all states', () => {
    mockService.overallStatus.set('healthy');
    expect(component.getStatusDescription()).toContain('operational');

    mockService.overallStatus.set('degraded');
    expect(component.getStatusDescription()).toContain('non-fatal warnings');

    mockService.overallStatus.set('unreachable');
    expect(component.getStatusDescription()).toContain('not responding');

    mockService.overallStatus.set('critical');
    expect(component.getStatusDescription()).toContain('Critical database');
  });
});
