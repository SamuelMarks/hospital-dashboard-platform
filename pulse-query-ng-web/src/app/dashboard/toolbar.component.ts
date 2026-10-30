/**
 * @fileoverview Top application toolbar component providing global navigation,
 * dashboard editing controls, theme customization, export actions, and user session management.
 */
import { Component, computed, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../core/auth/auth.service';
import { DashboardStore } from './dashboard.store';
import { AskDataService } from '../global/ask-data.service';
import { ThemeService } from '../core/theme/theme.service';
import { WidgetBuilderComponent } from './widget-builder/widget-builder.component';
import { QueryCartService } from '../global/query-cart.service';
import { ShareDashboardDialog } from './share-dashboard/share-dashboard.dialog';
import { CollaboratorPresenceComponent } from './collaborator-presence/collaborator-presence.component';
import { UndoRedoButtonsComponent } from '../shared/components/undo-redo-buttons.component';
import { ThemeColorPickerDialogComponent } from './theme-picker/theme-color-picker.dialog';
import { triggerBlobDownload } from '../shared/utils/csv-export.utils';
import { extractEventInputValue } from '../shared/utils/dom-event.utils';

/** Top application toolbar component hosting dashboard controls, exports, and user actions. */
@Component({
  selector: 'app-toolbar',
  imports: [
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
    MatSnackBarModule,
    CollaboratorPresenceComponent,
    UndoRedoButtonsComponent,
  ],

  templateUrl: './toolbar.component.html',
  styles: [
    `
      .app-toolbar {
        background-color: var(--sys-surface);
        color: var(--sys-on-surface);
        border-bottom: 1px solid var(--sys-surface-border);
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .title-group {
        display: flex;
        flex-direction: column;
        line-height: 1.15;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
      }
      .title-group:focus-visible {
        outline: 2px solid var(--sys-primary);
        outline-offset: 2px;
      }
      .title-overline {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .title-main {
        font-size: 16px;
        font-weight: 500;
      }
      .nav-links {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .toolbar-spacer {
        flex: 1 1 auto;
      }
      .items-center {
        display: flex;
        align-items: center;
      }
      .gap-2 {
        gap: 8px;
      }
      .mr-2 {
        margin-right: 8px;
      }
      .divider-vertical {
        width: 1px;
        height: 24px;
        background-color: var(--sys-surface-border);
        margin: 0 4px;
      }
      .color-dot {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
      }
      .color-dot.active {
        border-color: var(--sys-on-surface);
      }
      .menu-header-compact {
        padding: 6px 16px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
      }
      .menu-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--sys-surface-border);
      }
      .large-avatar {
        font-size: 36px;
        width: 36px;
        height: 36px;
        color: var(--sys-primary);
      }
      .menu-email {
        font-size: 12px;
        color: var(--sys-text-secondary);
      }
    `,
  ],
})
export class ToolbarComponent {
  /** Active dashboard state store. */
  public readonly store = inject(DashboardStore);
  /** Service controlling the global Ask Data drawer. */
  public readonly askDataService = inject(AskDataService);
  /** Service managing the user's saved query cart. */
  private readonly cart = inject(QueryCartService);
  /** Authentication service for user state and logout. */
  public readonly authService = inject(AuthService);
  /** Theme service for dark mode and Material 3 color seed updates. */
  public readonly themeService = inject(ThemeService);
  /** Angular router for route inspection and navigation. */
  public readonly router = inject(Router);
  /** Material dialog service for opening modals. */
  private readonly dialog = inject(MatDialog);
  /** Material snackbar service for toast notifications. */
  private readonly snackBar = inject(MatSnackBar);
  /** HTTP client for downloading dashboard export blobs. */
  private readonly http = inject(HttpClient);
  /** Injected DOM document reference. */
  private readonly document = inject(DOCUMENT);

  /** Reactive count of queries currently stored in the query cart. */
  readonly cartCount = this.cart.count;
  /** Preset Material 3 seed hex colors available in the theme menu. */
  readonly presetColors = ['#1565c0', '#7b1fa2', '#00796b', '#c62828', '#ef6c00'];

  /** Map of preset hex colors to human-readable localized color names. */
  private readonly presetColorNames: Record<string, string> = {
    '#1565c0': $localize`Ocean Blue`,
    '#7b1fa2': $localize`Royal Purple`,
    '#00796b': $localize`Forest Health`,
    '#c62828': $localize`Crimson Red`,
    '#ef6c00': $localize`Amber Urgent`,
  };

  /** Computed localized aria-label for the dashboard refresh button. */
  readonly refreshAriaLabel = computed(() =>
    this.store.isLoading() ? $localize`Refreshing Data` : $localize`Refresh Dashboard`,
  );

  /**
   * Formats a localized accessible label for a theme preset color swatch button.
   *
   * @param color - Hexadecimal color string.
   * @returns Localized accessible label string.
   */
  getColorAriaLabel(color: string): string {
    const label = this.presetColorNames[color.toLowerCase()] || color;
    return $localize`Set theme color to ${label}`;
  }

  /** Signal indicating whether the current route is an active dashboard view. */
  readonly isDashboardRoute = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.includes('/dashboard/')),
    ),
    {
      initialValue: this.router.url.includes('/dashboard/'),
    },
  );

  /** Logs out the current user. */
  logout(): void {
    this.authService.logout();
  }

  /** Toggles dashboard edit mode to reveal the query cart or prompts the user to open a dashboard. */
  openCart(): void {
    // Logic split based on location context
    if (this.isDashboardRoute() && this.store.dashboard()) {
      if (!this.store.isEditMode()) {
        this.store.toggleEditMode();
      }
    } else {
      // Hint to user if they try to access cart from non-editor screens
      this.snackBar
        .open($localize`Open a dashboard to place items from the cart.`, $localize`Go to Home`, {
          duration: 4000,
        })
        .onAction()
        .subscribe(() => this.router.navigate(['/']));
    }
  }

  /** Opens the multi-step Widget Builder dialog for the active dashboard and restores trigger focus on close. */
  openWidgetBuilder(): void {
    const currentDash = this.store.dashboard();
    if (!currentDash) return;
    const triggerEl =
      this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    const ref = this.dialog.open(WidgetBuilderComponent, {
      data: { dashboardId: currentDash.id },
      width: '1200px',
      maxWidth: '95vw',
      height: '90vh',
      panelClass: 'no-padding-dialog',
      restoreFocus: true,
    });
    ref.afterClosed().subscribe((res: boolean) => {
      if (res) this.store.loadDashboard(currentDash.id);
      if (triggerEl && typeof triggerEl.focus === 'function') {
        triggerEl.focus();
      }
    });
  }

  /**
   * Updates the application theme seed color.
   *
   * @param hex - The hex color string to apply as the Material 3 seed color.
   */
  updateTheme(hex: string): void {
    this.themeService.setSeedColor(hex);
  }

  /**
   * Handles native color picker input events to update the theme color.
   *
   * @param event - The DOM input change event from the color input element.
   */
  onColorPickerChange(event: Event): void {
    const val = extractEventInputValue(event);
    if (val) {
      this.updateTheme(val);
    }
  }

  /**
   * Opens the Theme Color Picker modal dialog.
   */
  openThemeDialog(): void {
    const currentDash = this.store.dashboard();
    this.dialog.open(ThemeColorPickerDialogComponent, {
      data: {
        dashboardId: currentDash?.id || '',
        dashboardName: currentDash?.name || $localize`Dashboard`,
        currentColor: this.themeService.seedColor(),
      },
      width: '480px',
      maxWidth: '95vw',
    });
  }

  /**
   * Exports the current dashboard in CSV, JSON, or PDF format via an authorized binary stream.
   *
   * @param format The export file format ('json', 'csv', or 'pdf').
   */
  exportDashboard(format: 'json' | 'csv' | 'pdf'): void {
    const currentDash = this.store.dashboard();
    if (!currentDash) return;

    const url =
      format === 'pdf'
        ? `/api/v1/dashboards/${currentDash.id}/export/pdf`
        : `/api/v1/dashboards/${currentDash.id}/export?format=${format}`;

    const safeTitle = (currentDash.name || 'dashboard').replace(/[^a-zA-Z0-9_-]/g, '_');
    const extension = format === 'pdf' ? 'pdf' : format;
    const filename = `${safeTitle}_export.${extension}`;

    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        triggerBlobDownload(this.document, blob, filename, true);
      },
      error: () => {
        this.snackBar.open(
          $localize`Failed to export dashboard. Please try again.`,
          $localize`Dismiss`,
          {
            duration: 4000,
          },
        );
      },
    });
  }

  /**
   * Opens the share dashboard modal for managing collaborators.
   */
  openShareDialog(): void {
    const currentDash = this.store.dashboard();
    if (!currentDash) return;
    this.dialog.open(ShareDashboardDialog, {
      data: {
        dashboardId: currentDash.id,
        dashboardName: currentDash.name,
      },
      width: '520px',
      maxWidth: '95vw',
    });
  }
}
