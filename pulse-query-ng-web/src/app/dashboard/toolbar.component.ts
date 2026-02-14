/**
 * @fileoverview Application Toolbar (Global Navigation).
 *
 * Contains Global Navigation Links, Context-Aware Actions (Edit/Refresh),
 * and System Settings (Theme Palette/Mode).
 *
 * **Changes:**
 * - Migrated template to external file `toolbar.component.html`.
 * - Implemented `ThemeService` integration for dynamic color seeding.
 * - Replaced custom CSS avatars with Material Icons.
 * - Added Color Picker logic.
 */

import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

// Material Imports
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatBadgeModule } from '@angular/material/badge';

import { AuthService } from '../core/auth/auth.service';
import { DashboardStore } from './dashboard.store';
import { AskDataService } from '../global/ask-data.service';
import { ThemeService } from '../core/theme/theme.service';
import { WidgetBuilderComponent } from './widget-builder/widget-builder.component';
import { QueryCartService } from '../global/query-cart.service';

/**
 * Toolbar Component.
 */
@Component({
  selector: 'app-toolbar',
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatBadgeModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toolbar.component.html',
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        position: relative;
        z-index: 10;
      }

      /* M3 Surface Container Mapping */
      .app-toolbar {
        background-color: var(--sys-surface);
        color: var(--sys-on-surface);
        border-bottom: 1px solid var(--sys-surface-border);
      }

      .toolbar-spacer {
        flex: 1 1 auto;
      }

      /* Brand Title */
      .title-group {
        display: flex;
        flex-direction: column;
        line-height: normal;
        cursor: pointer;
        user-select: none;
      }
      .title-overline {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 700;
      }
      .title-main {
        font-size: 16px;
        font-weight: 500;
      }

      /* Navigation */
      .nav-links {
        display: flex;
        gap: 4px;
        margin-left: 32px;
        height: 100%;
      }
      .nav-link {
        font-size: 14px;
        color: var(--sys-text-secondary);
        font-weight: 500;
        opacity: 0.7;
        height: 100%;
        border-radius: 0;
        padding: 0 16px;
        border-bottom: 2px solid transparent;
      }
      .nav-link.active-link {
        color: var(--sys-primary);
        opacity: 1;
        border-bottom-color: var(--sys-primary);
        background: linear-gradient(to top, var(--sys-selected), transparent);
      }

      /* Actions */
      .gap-2 {
        display: flex;
        gap: 8px;
      }
      .divider-vertical {
        height: 24px;
        width: 1px;
        background-color: var(--sys-surface-border);
        margin: 0 8px;
      }
      .text-secondary {
        color: var(--sys-text-secondary);
      }

      /* Menu Styles */
      .menu-header {
        padding: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        background-color: var(--sys-surface);
        outline: none;
      }
      .menu-header-compact {
        padding: 8px 16px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
      }
      .menu-email {
        margin-top: 8px;
        font-weight: 500;
        font-size: 14px;
        color: var(--sys-on-surface);
      }
      .large-avatar {
        width: 48px;
        height: 48px;
        font-size: 48px;
        color: var(--sys-text-secondary);
      }

      /* Color Palette */
      .palette-grid {
        min-width: 200px;
      }
      .color-dot {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid transparent;
        transition:
          transform 0.2s,
          border-color 0.2s;
      }
      .color-dot:hover {
        transform: scale(1.1);
      }
      .color-dot.active {
        border-color: var(--sys-on-surface);
        box-shadow: 0 0 0 2px var(--sys-surface);
      }

      /* Action Buttons */
      .action-btn {
        border-color: var(--sys-surface-border);
        color: var(--sys-primary);
      }
    `,
  ],
})
/* v8 ignore start */
export class ToolbarComponent {
  /* v8 ignore stop */
  /** Store. */
  public readonly store = inject(DashboardStore);
  /** Ask Data Service. */
  public readonly askDataService = inject(AskDataService);
  /** cart property. */
  private readonly cart = inject(QueryCartService);
  /** Auth Service. */
  public readonly authService = inject(AuthService);
  /** Theme Service. */
  public readonly themeService = inject(ThemeService);
  /** Router. */
  public readonly router = inject(Router);
  /** dialog property. */
  private readonly dialog = inject(MatDialog);
  /** Cart Count. */
  readonly cartCount = this.cart.count;

  /**
   * Preset Seeds for Theme Generation.
   * Includes:
   * - Material Blue (#1565c0)
   * - Deep Purple (#7b1fa2)
   * - Teal (#00796b)
   * - Red (#c62828)
   * - Orange (#ef6c00)
   */
  readonly presetColors = ['#1565c0', '#7b1fa2', '#00796b', '#c62828', '#ef6c00'];

  /** Signal indicating if the current view is a Dashboard Detail page. */
  readonly isDashboardRoute = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.includes('/dashboard/')),
    ),
    { initialValue: false },
  );

  /**
   * Logs out the user.
   */
  logout(): void {
    this.authService.logout();
  }

  /**
   * Opens the Widget Builder Dialog for the current dashboard.
   */
  openWidgetBuilder(): void {
    const currentDash = this.store.dashboard();
    if (!currentDash) return;

    const ref = this.dialog.open(WidgetBuilderComponent, {
      data: { dashboardId: currentDash.id },
      width: '1200px',
      maxWidth: '95vw',
      height: '90vh',
      panelClass: 'no-padding-dialog',
      disableClose: true,
    });

    ref.afterClosed().subscribe((res: boolean) => {
      if (res) this.store.loadDashboard(currentDash.id);
    });
  }

  /**
   * Updates the global application theme seed color.
   * @param {string} hex - Color hex code.
   */
  updateTheme(hex: string): void {
    this.themeService.setSeedColor(hex);
  }

  /**
   * Handles native color input changes for custom seeds.
   * @param {Event} event - Input Event.
   */
  onColorPickerChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.updateTheme(input.value);
    }
  }
}
