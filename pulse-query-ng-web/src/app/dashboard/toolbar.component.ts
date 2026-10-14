/**
 * @fileoverview Top application toolbar component providing global navigation,
 * dashboard editing controls, theme customization, export actions, and user session management.
 */
import { Component, inject } from '@angular/core';
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

/** Toolbar Component. */
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
  styles: ['/* See existing styles */'],
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

  /** Reactive count of queries currently stored in the query cart. */
  readonly cartCount = this.cart.count;
  /** Preset Material 3 seed hex colors available in the theme menu. */
  readonly presetColors = ['#1565c0', '#7b1fa2', '#00796b', '#c62828', '#ef6c00'];

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
        .open('Open a dashboard to place items from the cart.', 'Go to Home', { duration: 4000 })
        .onAction()
        .subscribe(() => this.router.navigate(['/']));
    }
  }

  /** Opens the multi-step Widget Builder dialog for the active dashboard. */
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
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.updateTheme(input.value);
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
        dashboardName: currentDash?.name || 'Dashboard',
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
        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(objectUrl);
      },
      error: () => {
        this.snackBar.open('Failed to export dashboard. Please try again.', 'Dismiss', {
          duration: 4000,
        });
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
