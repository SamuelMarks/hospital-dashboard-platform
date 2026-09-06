/* v8 ignore start */
/** @docs */
/**
 * @fileoverview Global System Health Banner component displaying real-time alert notifications
 * for backend inaccessibility, database misconfigurations, and missing default datasets.
 */

import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ConnectionStatusService } from '../../core/health/connection-status.service';

/**
 * Top-level system notification banner rendering connection states and error ribbons.
 */
@Component({
  selector: 'app-system-health-banner',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <!-- Offline Banner -->
    @if (!isOnline()) {
      <div class="health-banner banner-offline" role="alert" aria-live="assertive">
        <mat-icon i18n class="banner-icon">wifi_off</mat-icon>
        <div class="banner-text" i18n>
          <strong>No Internet Connection:</strong> You are currently working offline.
        </div>
      </div>
    }

    <!-- Backend Inaccessible Banner -->
    @if (isOnline() && !isBackendReachable()) {
      <div class="health-banner banner-unreachable" role="alert" aria-live="assertive">
        <mat-icon i18n class="banner-icon">cloud_off</mat-icon>
        <div class="banner-text" i18n>
          <strong>Backend Inaccessible:</strong> Cannot connect to Pulse Query Server.
          @if (countdown() > 0) {
            <span class="countdown-text"> Auto-retrying in {{ countdown() }}s... </span>
          }
        </div>
        <div class="banner-actions">
          <button mat-flat-button color="warn" (click)="retryNow()" [disabled]="isChecking()">
            @if (isChecking()) {
              <mat-spinner diameter="14"></mat-spinner>
            } @else {
              <span i18n>Retry Now</span>
            }
          </button>
          <button i18n mat-stroked-button color="warn" (click)="openTroubleshoot()">
            Troubleshoot
          </button>
        </div>
      </div>
    }

    <!-- Database Misconfiguration Banner -->
    @if (isOnline() && isBackendReachable() && status() === 'critical') {
      <div class="health-banner banner-critical" role="alert" aria-live="polite">
        <mat-icon i18n class="banner-icon">dns</mat-icon>
        <div class="banner-text" i18n>
          <strong>Database Misconfiguration:</strong> Backend database service (PostgreSQL / DuckDB)
          is unreachable or reporting critical errors.
        </div>
        <div class="banner-actions">
          <button i18n mat-flat-button color="warn" (click)="openTroubleshoot()">
            View Diagnostics
          </button>
        </div>
      </div>
    }

    <!-- Degraded Data / Missing Dataset Banner -->
    @if (isOnline() && isBackendReachable() && status() === 'degraded' && !isDismissed()) {
      <div class="health-banner banner-degraded" role="alert" aria-live="polite">
        <mat-icon i18n class="banner-icon">warning</mat-icon>
        <div class="banner-text" i18n>
          <strong>System Notice:</strong> Initial hospital dataset is missing or using synthetic
          fallback data.
        </div>
        <div class="banner-actions">
          <button i18n mat-button color="accent" (click)="openTroubleshoot()">Details</button>
          <button mat-icon-button (click)="dismiss()" aria-label="Dismiss warning banner">
            <mat-icon i18n>close</mat-icon>
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .health-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 1.25rem;
        font-size: 0.875rem;
        z-index: 1000;
        transition: all 0.2s ease-in-out;
      }
      .banner-icon {
        font-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
      }
      .banner-text {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .countdown-text {
        opacity: 0.85;
        font-style: italic;
      }
      .banner-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .banner-offline {
        background: #424242;
        color: #fff;
      }
      .banner-unreachable {
        background: #b71c1c;
        color: #fff;
      }
      .banner-critical {
        background: #d32f2f;
        color: #fff;
      }
      .banner-degraded {
        background: #fff3e0;
        color: #e65100;
        border-bottom: 1px solid #ffe0b2;
      }
    `,
  ],
})
export class SystemHealthBannerComponent {
  /** Injected ConnectionStatusService. */
  private readonly connectionService = inject(ConnectionStatusService);

  /** Signal reflecting browser online status. */
  readonly isOnline = this.connectionService.isOnline;
  /** Signal reflecting backend accessibility. */
  readonly isBackendReachable = this.connectionService.isBackendReachable;
  /** Signal reflecting overall system status. */
  readonly status = this.connectionService.overallStatus;
  /** Signal reflecting reconnect countdown timer. */
  readonly countdown = this.connectionService.reconnectCountdown;
  /** Signal reflecting active checking state. */
  readonly isChecking = this.connectionService.isChecking;
  /** Signal reflecting whether banner has been dismissed. */
  readonly isDismissed = this.connectionService.isDismissed;

  /**
   * Triggers an immediate connection retry.
   */
  retryNow(): void {
    this.connectionService.checkHealth().subscribe();
  }

  /**
   * Opens the troubleshooting diagnostics dialog.
   */
  openTroubleshoot(): void {
    this.connectionService.openDiagnosticsDialog();
  }

  /**
   * Dismisses the banner notification for the current session.
   */
  dismiss(): void {
    this.connectionService.dismissWarningBanner();
  }
}
