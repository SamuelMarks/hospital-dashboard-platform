/* v8 ignore start */
/** @docs */
/**
 * @fileoverview Dialog component displaying live backend system diagnostics,
 * database connectivity status, active warnings, and copyable troubleshooting commands.
 */

import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="dialog-header">
      <div class="header-title">
        <mat-icon i18n color="primary">health_and_safety</mat-icon>
        <h2 i18n mat-dialog-title>System Health &amp; Diagnostics</h2>
      </div>
      <button
        i18n-aria-label
        mat-icon-button
        mat-dialog-close
        aria-label="Close diagnostics dialog"
      >
        <mat-icon i18n>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content class="dialog-content">
      <!-- Status Summary Banner -->
      <div
        class="status-banner"
        [class.banner-healthy]="status() === 'healthy'"
        [class.banner-degraded]="status() === 'degraded'"
        [class.banner-critical]="status() === 'critical' || status() === 'unreachable'"
      >
        <mat-icon>{{
          status() === 'healthy' ? 'check_circle' : status() === 'degraded' ? 'warning' : 'error'
        }}</mat-icon>
        <div class="banner-text" i18n>
          <strong>Overall State: {{ status() | uppercase }}</strong>
          <span>{{ getStatusDescription() }}</span>
        </div>
        <button mat-stroked-button color="primary" (click)="refresh()" [disabled]="isRefreshing()">
          @if (!isRefreshing()) {
            <mat-icon i18n>refresh</mat-icon>
          } @else {
            <mat-spinner diameter="16"></mat-spinner>
          }
          <span i18n>Test Now</span>
        </button>
      </div>

      <!-- Component Cards Grid -->
      <div class="cards-grid">
        <!-- PostgreSQL Card -->
        <mat-card class="subsystem-card" appearance="outlined">
          <mat-card-header>
            <mat-icon
              mat-card-avatar
              [class.color-success]="pgStatus() === 'connected'"
              [class.color-error]="pgStatus() !== 'connected'"
            >
              {{ pgStatus() === 'connected' ? 'dns' : 'portable_wifi_off' }}
            </mat-icon>
            <mat-card-title i18n>PostgreSQL</mat-card-title>
            <mat-card-subtitle i18n>{{
              pgStatus() === 'connected' ? 'Connected' : 'Unavailable'
            }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (health()?.postgres?.latency_ms !== null) {
              <p i18n>
                Latency: <strong>{{ health()?.postgres?.latency_ms }} ms</strong>
              </p>
            }
            @if (health()?.postgres?.error) {
              <p class="error-msg" i18n>
                {{ health()?.postgres?.error }}
              </p>
            }
          </mat-card-content>
        </mat-card>

        <!-- DuckDB Analytics Card -->
        <mat-card class="subsystem-card" appearance="outlined">
          <mat-card-header>
            <mat-icon
              i18n
              mat-card-avatar
              [class.color-success]="duckStatus() === 'ready'"
              [class.color-error]="duckStatus() !== 'ready'"
            >
              storage
            </mat-icon>
            <mat-card-title i18n>DuckDB OLAP</mat-card-title>
            <mat-card-subtitle i18n>{{
              duckStatus() === 'ready' ? 'Ready' : 'Error'
            }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <p i18n>
              Tables:
              <strong>{{ health()?.duckdb?.total_tables || 0 }}</strong>
            </p>
            @if (health()?.duckdb?.error) {
              <p class="error-msg" i18n>
                {{ health()?.duckdb?.error }}
              </p>
            }
          </mat-card-content>
        </mat-card>

        <!-- Clinical Datasets Card -->
        <mat-card class="subsystem-card" appearance="outlined">
          <mat-card-header>
            <mat-icon
              i18n
              mat-card-avatar
              [class.color-success]="hasDefaultData()"
              [class.color-warning]="!hasDefaultData()"
            >
              folder_shared
            </mat-icon>
            <mat-card-title i18n>Clinical Data</mat-card-title>
            <mat-card-subtitle i18n>{{
              hasDefaultData() ? 'Default CSV Loaded' : 'Fallback Dataset'
            }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (health()?.data?.fallback_generated) {
              <p class="warning-msg" i18n>
                Default hospital_data.csv missing; sample data generated.
              </p>
            }
            <button mat-button color="accent" (click)="reingestData()" [disabled]="isReingesting()">
              <mat-icon i18n>sync</mat-icon>
              <span i18n>{{ isReingesting() ? 'Ingesting...' : 'Reload CSVs' }}</span>
            </button>
          </mat-card-content>
        </mat-card>

        <!-- LLM Swarm Card -->
        <mat-card class="subsystem-card" appearance="outlined">
          <mat-card-header>
            <mat-icon
              i18n
              mat-card-avatar
              [class.color-success]="!isMockLlm()"
              [class.color-info]="isMockLlm()"
            >
              psychology
            </mat-icon>
            <mat-card-title i18n>AI / Text-to-SQL</mat-card-title>
            <mat-card-subtitle i18n>{{
              isMockLlm() ? 'Mock AI Mode' : 'Cloud LLM Ready'
            }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <p i18n>
              Providers:
              <strong>{{ health()?.llm?.providers_count || 0 }}</strong>
            </p>
            @if (isMockLlm()) {
              <p class="info-msg" i18n>Using deterministic fallback generator.</p>
            }
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Active Warnings List -->
      @if (warnings().length > 0) {
        <div class="section">
          <h3 i18n>Active System Warnings</h3>
          <div class="warning-list">
            @for (w of warnings(); track w.code + w.message) {
              <div class="warning-item">
                <mat-icon i18n class="color-warning">warning</mat-icon>
                <div class="warning-details" i18n>
                  <strong>{{ w.code }}:</strong> {{ w.message }}
                  @if (w.remediation) {
                    <div class="remediation"><em>Action:</em> {{ w.remediation }}</div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      <mat-divider></mat-divider>

      <!-- Troubleshooting Guides -->
      <div class="section">
        <h3 i18n>Quick Remediation Commands</h3>
        <div class="guide-list">
          @for (step of troubleshootingGuides(); track step.title) {
            <div class="guide-item">
              <div class="guide-header">
                <strong i18n>{{ step.title }}</strong>
                @if (step.command) {
                  <button
                    mat-icon-button
                    (click)="copyCommand(step.command)"
                    i18n-matTooltip
                    matTooltip="Copy command to clipboard"
                    i18n-aria-label
                    aria-label="Copy command"
                  >
                    <mat-icon i18n>content_copy</mat-icon>
                  </button>
                }
              </div>
              <p class="guide-desc" i18n>{{ step.description }}</p>
              @if (step.command) {
                <code class="command-box">{{ step.command }}</code>
              }
            </div>
          }
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button i18n mat-flat-button color="primary" mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
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
        background: rgba(46, 125, 50, 0.1);
        border-color: #2e7d32;
        color: #1b5e20;
      }
      .banner-degraded {
        background: rgba(237, 108, 2, 0.1);
        border-color: #ed6c02;
        color: #e65100;
      }
      .banner-critical {
        background: rgba(211, 47, 47, 0.1);
        border-color: #d32f2f;
        color: #c62828;
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
        color: #2e7d32;
      }
      .color-warning {
        color: #ed6c02;
      }
      .color-error {
        color: #d32f2f;
      }
      .color-info {
        color: #0288d1;
      }
      .error-msg {
        color: #d32f2f;
        font-size: 0.8rem;
      }
      .warning-msg {
        color: #ed6c02;
        font-size: 0.8rem;
      }
      .info-msg {
        color: #555;
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
        background: #fff8e1;
        padding: 0.5rem 0.75rem;
        border-radius: 4px;
        border-left: 4px solid #ffb300;
      }
      .warning-details {
        font-size: 0.85rem;
      }
      .remediation {
        margin-top: 0.25rem;
        color: #555;
      }
      .guide-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .guide-item {
        background: #f5f5f5;
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
        color: #666;
        margin: 0.25rem 0;
      }
      .command-box {
        display: block;
        background: #212121;
        color: #76ff03;
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
      this.snackBar.open('Health status refreshed.', 'Dismiss', {
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
        this.snackBar.open(res.message || 'Dataset re-ingestion completed.', 'OK', {
          duration: 3000,
        });
      },
      error: () => {
        this.isReingesting.set(false);
        this.snackBar.open('Dataset re-ingestion failed.', 'Dismiss', {
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
        this.snackBar.open('Command copied to clipboard!', undefined, {
          duration: 2000,
        });
      });
    }
  }

  /**
   * Returns PostgreSQL status string.
   *
   * @returns Connection status string.
   */
  pgStatus(): string {
    return this.health()?.postgres?.status || 'unknown';
  }

  /**
   * Returns DuckDB status string.
   *
   * @returns Storage status string.
   */
  duckStatus(): string {
    return this.health()?.duckdb?.status || 'unknown';
  }

  /**
   * Returns true if default hospital clinical data is available.
   *
   * @returns Boolean indicating default dataset presence.
   */
  hasDefaultData(): boolean {
    return this.health()?.data?.has_default_data ?? true;
  }

  /**
   * Returns true if LLM operates in mock/fallback mode.
   *
   * @returns Boolean indicating mock LLM status.
   */
  isMockLlm(): boolean {
    return this.health()?.llm?.mock_mode ?? true;
  }

  /**
   * Returns human-readable description for current overall status.
   *
   * @returns Description text.
   */
  getStatusDescription(): string {
    const s = this.status();
    if (s === 'healthy') return 'All services and databases operational.';
    if (s === 'degraded') return 'Some non-fatal warnings or missing default datasets detected.';
    if (s === 'unreachable') return 'Pulse Query backend is not responding to network requests.';
    return 'Critical database or configuration failure detected.';
  }
}
