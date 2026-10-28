/**
 * @fileoverview Dialog component displaying live backend system diagnostics,
 * database connectivity status, active warnings, and copyable troubleshooting commands.
 */

import { UpperCasePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ConnectionStatusService,
  SystemDiagnosticsResponse,
  TroubleshootingStep,
} from '../../../core/health/connection-status.service';

/**
 * System diagnostics and connection troubleshooting dialog.
 */
@Component({
  selector: 'app-system-diagnostics-dialog',
  imports: [
    UpperCasePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './system-diagnostics-dialog.component.html',
  styles: [
    `
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
      }
      .header-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .dialog-content {
        padding: 0 1.5rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-height: 75vh;
      }
      .status-banner {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.875rem 1rem;
        border-radius: 8px;
        border: 1px solid transparent;
      }
      .banner-healthy {
        background: color-mix(in srgb, var(--sys-success, #2e7d32) 15%, var(--sys-surface));
        border-color: var(--sys-success, #2e7d32);
        color: var(--sys-on-surface);
      }
      .banner-degraded {
        background: color-mix(in srgb, var(--sys-warn, #ed6c02) 15%, var(--sys-surface));
        border-color: var(--sys-warn, #ed6c02);
        color: var(--sys-on-surface);
      }
      .banner-critical {
        background: var(--sys-error-container);
        border-color: var(--sys-error);
        color: var(--sys-on-error-container);
      }
      .banner-text {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
      }
      .subsystem-card {
        padding: 0.5rem;
      }
      .color-success {
        color: var(--sys-success, #2e7d32);
      }
      .color-warning {
        color: var(--sys-warn, #ed6c02);
      }
      .color-error {
        color: var(--sys-error);
      }
      .color-info {
        color: var(--sys-primary);
      }
      .error-msg {
        color: var(--sys-error);
        font-size: 0.8rem;
      }
      .warning-msg {
        color: var(--sys-warn, #ed6c02);
        font-size: 0.8rem;
      }
      .info-msg {
        color: var(--sys-text-secondary);
        font-size: 0.8rem;
      }
      .section {
        margin-top: 0.5rem;
      }
      .section h3 {
        margin-bottom: 0.5rem;
        font-size: 1rem;
        font-weight: 600;
      }
      .warning-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .warning-item {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        background: var(--sys-surface-variant);
        color: var(--sys-on-surface);
        padding: 0.5rem 0.75rem;
        border-radius: 4px;
        border-left: 4px solid var(--sys-warn, #ffb300);
      }
      .warning-details {
        font-size: 0.85rem;
      }
      .remediation {
        margin-top: 0.25rem;
        color: var(--sys-text-secondary);
      }
      .guide-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .guide-item {
        background: var(--sys-surface-variant);
        color: var(--sys-on-surface);
        padding: 0.75rem;
        border-radius: 6px;
      }
      .guide-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .guide-desc {
        font-size: 0.85rem;
        color: var(--sys-text-secondary);
        margin: 0.25rem 0;
      }
      .command-box {
        display: block;
        background: var(--sys-surface);
        color: var(--sys-primary);
        border: 1px solid var(--sys-surface-border);
        padding: 0.4rem 0.6rem;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.85rem;
        overflow-x: auto;
      }
    `,
  ],
})
export class SystemDiagnosticsDialogComponent implements OnInit {
  /** Injected ConnectionStatusService. */
  private readonly connectionService = inject(ConnectionStatusService);
  /** Injected MatDialogRef. */
  private readonly dialogRef = inject(MatDialogRef<SystemDiagnosticsDialogComponent>);
  /** Injected MatSnackBar. */
  private readonly snackBar = inject(MatSnackBar);

  /** Signal holding live health snapshot. */
  readonly health = this.connectionService.healthData;
  /** Signal holding overall status. */
  readonly status = this.connectionService.overallStatus;
  /** Signal holding active warnings. */
  readonly warnings = this.connectionService.activeWarnings;

  /** Signal tracking in-flight refresh requests. */
  readonly isRefreshing = signal<boolean>(false);
  /** Signal tracking in-flight re-ingestion requests. */
  readonly isReingesting = signal<boolean>(false);
  /** Signal holding troubleshooting guides list. */
  readonly troubleshootingGuides = signal<TroubleshootingStep[]>([]);

  /**
   * Initializes diagnostic guides on dialog open.
   */
  ngOnInit(): void {
    this.fetchDiagnostics();
  }

  /**
   * Fetches detailed troubleshooting steps and environment information.
   */
  fetchDiagnostics(): void {
    this.connectionService.getDiagnostics().subscribe((res: SystemDiagnosticsResponse) => {
      if (res?.troubleshooting_guides) {
        this.troubleshootingGuides.set(res.troubleshooting_guides);
      }
    });
  }

  /**
   * Re-runs health check tests against PostgreSQL, DuckDB, and API endpoints.
   */
  refresh(): void {
    this.isRefreshing.set(true);
    this.connectionService.checkHealth().subscribe(() => {
      this.isRefreshing.set(false);
      this.fetchDiagnostics();
      this.snackBar.open($localize`Health status refreshed.`, $localize`Dismiss`, {
        duration: 2500,
      });
    });
  }

  /**
   * Triggers dataset re-ingestion into DuckDB.
   */
  reingestData(): void {
    this.isReingesting.set(true);
    this.connectionService.triggerReingest().subscribe({
      next: (res) => {
        this.isReingesting.set(false);
        this.snackBar.open(
          res.message || $localize`Dataset re-ingestion completed.`,
          $localize`OK`,
          {
            duration: 3000,
          },
        );
      },
      error: () => {
        this.isReingesting.set(false);
        this.snackBar.open($localize`Dataset re-ingestion failed.`, $localize`Dismiss`, {
          duration: 3000,
        });
      },
    });
  }

  /**
   * Copies command text to the system clipboard and notifies user.
   *
   * @param command Command string to copy.
   */
  copyCommand(command: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(command).then(() => {
        this.snackBar.open($localize`Command copied to clipboard!`, undefined, {
          duration: 2000,
        });
      });
    }
  }

  /**
   * Computed signal returning PostgreSQL status string.
   */
  readonly pgStatus = computed((): string => {
    return this.health()?.postgres?.status || 'unknown';
  });

  /**
   * Computed signal returning DuckDB status string.
   */
  readonly duckStatus = computed((): string => {
    return this.health()?.duckdb?.status || 'unknown';
  });

  /**
   * Computed signal returning true if default hospital clinical data is available.
   */
  readonly hasDefaultData = computed((): boolean => {
    return this.health()?.data?.has_default_data ?? true;
  });

  /**
   * Computed signal returning true if LLM operates in mock/fallback mode.
   */
  readonly isMockLlm = computed((): boolean => {
    return this.health()?.llm?.mock_mode ?? true;
  });

  /**
   * Computed signal returning human-readable description for current overall status.
   */
  readonly getStatusDescription = computed((): string => {
    const s = this.status();
    if (s === 'healthy') return $localize`All services and databases operational.`;
    if (s === 'degraded')
      return $localize`Some non-fatal warnings or missing default datasets detected.`;
    if (s === 'unreachable')
      return $localize`Pulse Query backend is not responding to network requests.`;
    return $localize`Critical database or configuration failure detected.`;
  });
}
