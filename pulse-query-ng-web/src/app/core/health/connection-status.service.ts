/* v8 ignore start */
/** @docs */
/**
 * @fileoverview Service for tracking global backend reachability, database connectivity,
 * and system health diagnostic state.
 */

import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { catchError, Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Diagnostic warning item returned by the backend health API.
 */
export interface DiagnosticWarning {
  /** Warning category code. */
  code: string;
  /** Human-readable warning description. */
  message: string;
  /** Warning severity level (info, warning, critical). */
  severity: string;
  /** Actionable remediation steps. */
  remediation: string;
  /** Timestamp when warning was recorded. */
  timestamp: string;
}

/**
 * PostgreSQL connection health snapshot.
 */
export interface PostgresHealth {
  /** Connection state. */
  status: string;
  /** Latency in milliseconds. */
  latency_ms: number | null;
  /** Host details. */
  details: string | null;
  /** Error message if failed. */
  error: string | null;
}

/**
 * DuckDB storage health snapshot.
 */
export interface DuckDbHealth {
  /** Storage status. */
  status: string;
  /** Database file path. */
  path: string | null;
  /** Map of table names to row counts. */
  tables: Record<string, number>;
  /** Total count of analytics tables. */
  total_tables: number;
  /** Error message if storage check failed. */
  error: string | null;
}

/**
 * Clinical data availability status.
 */
export interface DataHealth {
  /** True if default hospital_data.csv is present. */
  has_default_data: boolean;
  /** True if fallback synthetic data was generated. */
  fallback_generated: boolean;
  /** List of missing expected files. */
  missing_files: string[];
  /** Ingested table row counts. */
  row_counts: Record<string, number>;
}

/**
 * Template seeder pack status.
 */
export interface TemplateHealth {
  /** Total number of seeded templates. */
  templates_loaded: number;
  /** True if templates are loaded. */
  has_templates: boolean;
  /** True if initial_templates.json was missing. */
  missing_file: boolean;
}

/**
 * LLM configuration health status.
 */
export interface LlmHealth {
  /** Number of active providers. */
  providers_count: number;
  /** True if running in mock SQL mode. */
  mock_mode: boolean;
  /** List of configured model names. */
  models: string[];
}

/**
 * Aggregated system health response payload.
 */
export interface SystemHealthResponse {
  /** Overall health evaluation: healthy, degraded, or critical. */
  overall_status: 'healthy' | 'degraded' | 'critical' | 'unreachable';
  /** Timestamp of assessment. */
  timestamp: string;
  /** PostgreSQL status. */
  postgres: PostgresHealth;
  /** DuckDB status. */
  duckdb: DuckDbHealth;
  /** Ingestion data status. */
  data: DataHealth;
  /** Template registry status. */
  templates: TemplateHealth;
  /** LLM provider status. */
  llm: LlmHealth;
  /** Active diagnostic warnings. */
  warnings: DiagnosticWarning[];
}

/**
 * Remediation step for troubleshooting.
 */
export interface TroubleshootingStep {
  /** Step heading. */
  title: string;
  /** Optional shell command. */
  command?: string | null;
  /** Detailed step instructions. */
  description: string;
}

/**
 * Detailed diagnostics response payload.
 */
export interface SystemDiagnosticsResponse {
  /** Live health snapshot. */
  health: SystemHealthResponse;
  /** Environment check values. */
  environment_checks: Record<string, unknown>;
  /** Curated troubleshooting guides. */
  troubleshooting_guides: TroubleshootingStep[];
}

/**
 * Dataset re-ingestion operation result.
 */
export interface ReingestResponse {
  /** True if operation succeeded. */
  success: boolean;
  /** Result message. */
  message: string;
  /** Updated table row counts. */
  tables: Record<string, number>;
}

/**
 * Global service managing backend reachability, database diagnostics, and health alerts.
 */
@Injectable({
  providedIn: 'root',
})
export class ConnectionStatusService {
  /** Injected HTTP client. */
  private readonly http = inject(HttpClient);
  /** Injected MatDialog service. */
  private readonly dialog = inject(MatDialog);

  /** Internal timer handle for reconnect countdown. */
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  /** Signal indicating if the browser has network access. */
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  /** Signal indicating if the PulseQuery backend is reachable. */
  readonly isBackendReachable = signal<boolean>(true);

  /** Signal indicating if the database layer is healthy. */
  readonly isDatabaseHealthy = signal<boolean>(true);

  /** Signal tracking aggregate system status. */
  readonly overallStatus = signal<'healthy' | 'degraded' | 'critical' | 'unreachable'>('healthy');

  /** Signal containing the latest health snapshot. */
  readonly healthData = signal<SystemHealthResponse | null>(null);

  /** Signal containing currently active diagnostic warnings. */
  readonly activeWarnings = signal<DiagnosticWarning[]>([]);

  /** Signal holding seconds remaining before the next auto-retry attempt. */
  readonly reconnectCountdown = signal<number>(0);

  /** Signal tracking if a health check request is currently in flight. */
  readonly isChecking = signal<boolean>(false);

  /** Signal indicating if the user manually dismissed the warning banner. */
  readonly isDismissed = signal<boolean>(false);

  /** Base API endpoint URL. */
  private readonly baseUrl = environment.apiUrl || '';

  /**
   * Initializes browser online/offline listeners.
   */
  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline.set(true);
        this.checkHealth().subscribe();
      });
      window.addEventListener('offline', () => {
        this.isOnline.set(false);
        this.overallStatus.set('unreachable');
      });
    }
  }

  /**
   * Queries the backend health endpoint and updates state signals.
   *
   * @returns Observable emitting the SystemHealthResponse or null on error.
   */
  checkHealth(): Observable<SystemHealthResponse | null> {
    this.isChecking.set(true);
    const url = `${this.baseUrl}/api/v1/system/health`;

    return this.http.get<SystemHealthResponse>(url).pipe(
      tap((res) => {
        this.isChecking.set(false);
        this.isBackendReachable.set(true);
        this.cancelRetryCountdown();
        this.healthData.set(res);
        this.activeWarnings.set(res.warnings || []);

        const isPgHealthy = res.postgres?.status === 'connected';
        const isDuckHealthy = res.duckdb?.status === 'ready';
        this.isDatabaseHealthy.set(isPgHealthy && isDuckHealthy);

        this.overallStatus.set(res.overall_status);
      }),
      catchError(() => {
        this.isChecking.set(false);
        this.markBackendUnreachable();
        return of(null);
      }),
    );
  }

  /**
   * Marks backend as unreachable and initiates the auto-reconnect countdown.
   */
  markBackendUnreachable(): void {
    this.isBackendReachable.set(false);
    this.isDatabaseHealthy.set(false);
    this.overallStatus.set('unreachable');
    this.isDismissed.set(false);
    this.startRetryCountdown(10);
  }

  /**
   * Starts a countdown timer in seconds before triggering an automated checkHealth attempt.
   *
   * @param seconds Number of seconds to count down.
   */
  startRetryCountdown(seconds = 10): void {
    this.cancelRetryCountdown();
    this.reconnectCountdown.set(seconds);

    this.countdownTimer = setInterval(() => {
      const current = this.reconnectCountdown();
      if (current <= 1) {
        this.cancelRetryCountdown();
        this.checkHealth().subscribe();
      } else {
        this.reconnectCountdown.set(current - 1);
      }
    }, 1000);
  }

  /**
   * Cancels any active reconnect countdown timer.
   */
  cancelRetryCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.reconnectCountdown.set(0);
  }

  /**
   * Retrieves comprehensive system diagnostics and troubleshooting guides.
   *
   * @returns Observable emitting detailed SystemDiagnosticsResponse.
   */
  getDiagnostics(): Observable<SystemDiagnosticsResponse> {
    const url = `${this.baseUrl}/api/v1/system/diagnostics`;
    return this.http.get<SystemDiagnosticsResponse>(url);
  }

  /**
   * Triggers manual CSV re-ingestion in the analytics database.
   *
   * @returns Observable emitting the ReingestResponse.
   */
  triggerReingest(): Observable<ReingestResponse> {
    const url = `${this.baseUrl}/api/v1/system/reingest`;
    return this.http.post<ReingestResponse>(url, {}).pipe(
      tap(() => {
        this.checkHealth().subscribe();
      }),
    );
  }

  /**
   * Dismisses the system health notification banner for the current session.
   */
  dismissWarningBanner(): void {
    this.isDismissed.set(true);
  }

  /**
   * Opens the system diagnostics and connection troubleshooting dialog.
   *
   * @returns Promise resolving when dialog has been opened.
   */
  async openDiagnosticsDialog(): Promise<void> {
    const { SystemDiagnosticsDialogComponent } =
      await import('../../shared/components/dialogs/system-diagnostics-dialog.component');
    this.dialog.open(SystemDiagnosticsDialogComponent, {
      width: '800px',
      maxWidth: '95vw',
      panelClass: 'system-diagnostics-dialog-container',
    });
  }
}
