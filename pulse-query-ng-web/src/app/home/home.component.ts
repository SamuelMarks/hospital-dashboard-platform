/**
 * @fileoverview Home landing page component displaying the user's dashboards grid
 * with actions to create, clone, rename, delete, or restore default dashboards.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

// Material Imports
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { DashboardsService, DashboardResponse } from '../api-client';
import { DashboardCreateDialog } from './dashboard-create.dialog';
import { AskDataService } from '../global/ask-data.service';
import { PromptDialogComponent } from '../shared/components/dialogs/prompt-dialog.component';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';
import { AuthService } from '../core/auth/auth.service';
import { ThemeToggleComponent } from '../shared/components/theme-toggle.component';
import { OnboardingWizardComponent } from '../shared/components/onboarding/onboarding-wizard.component';
import { OnboardingService } from '../shared/components/onboarding/onboarding.service';

/**
 * Landing page component listing available hospital analytics dashboards and management actions.
 */
@Component({
  selector: 'app-home',
  imports: [
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatTooltipModule,
    MatSnackBarModule,
    ThemeToggleComponent,
    OnboardingWizardComponent,
  ],

  templateUrl: './home.component.html',
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        /* Dynamic Theme Vars */
        background-color: var(--sys-background);
        color: var(--sys-text-primary);
        padding: 32px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 32px;
        max-width: 1200px;
        margin-left: auto;
        margin-right: auto;
      }
      .header-text h1 {
        margin: 0;
        font-size: 32px;
        font-weight: 300;
        color: var(--sys-text-primary);
      }
      .header-text p {
        margin: 4px 0 0 0;
        color: var(--sys-text-secondary);
      }
      .grid-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 24px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .dash-card {
        cursor: pointer;
        transition:
          transform 0.2s,
          box-shadow 0.2s,
          border-color 0.2s;
        position: relative;
        background-color: var(--sys-surface);
        border: 1px solid var(--sys-surface-border);
      }
      .dash-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        border-color: var(--sys-primary);
      }
      .avatar-placeholder {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        /* Use Containers for avatar backgrounds */
        background-color: var(--sys-primary-container);
        color: var(--sys-on-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
      }
      .card-actions-btn {
        margin-left: auto;
        color: var(--sys-text-secondary);
      }
      .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 64px;
        background: var(--sys-surface);
        border-radius: 8px;
        border: 2px dashed var(--sys-outline-variant);
        color: var(--sys-text-secondary);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }
      .loading-container {
        display: flex;
        justify-content: center;
        padding-top: 64px;
      }
      .btn-group {
        display: flex;
        gap: 12px;
      }
    `,
  ],
})
export class HomeComponent implements OnInit {
  /** Backend dashboards API service. */
  private readonly dashboardsApi = inject(DashboardsService);
  /** Material dialog service for modals. */
  private readonly dialog = inject(MatDialog);
  /** Angular router for navigating to selected dashboards. */
  private readonly router = inject(Router);
  /** Material snackbar for status notifications. */
  private readonly snackBar = inject(MatSnackBar);
  /** Service controlling the global Ask Data sidebar. */
  public readonly askDataService = inject(AskDataService);
  /** Authentication service for user profile and logout actions. */
  public readonly authService = inject(AuthService);
  /** Service managing the interactive onboarding tour. */
  public readonly onboardingService = inject(OnboardingService);

  /** Reactive list of dashboards accessible to the current user. */
  readonly dashboards = signal<DashboardResponse[]>([]);
  /** Whether the dashboard list is currently loading. */
  readonly isLoading = signal(true);
  /** Whether a default dashboard restoration request is in progress. */
  readonly isRestoring = signal(false);

  /** Loads the user's dashboards when the home page initializes. */
  ngOnInit(): void {
    this.loadDashboards();
  }

  /** Fetches the list of dashboards from the backend API. */
  loadDashboards(): void {
    this.isLoading.set(true);
    this.dashboardsApi
      .listDashboardsApiV1DashboardsGet()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (data) => this.dashboards.set(data),
        error: (err) => {
          console.error(err);
          this.snackBar
            .open('Failed to load dashboards', 'Retry', { duration: 5000 })
            .onAction()
            .subscribe(() => this.loadDashboards());
        },
      });
  }

  /** Opens the create dashboard modal dialog and navigates to the newly created dashboard. */
  openCreateDialog(): void {
    const dialogRef = this.dialog.open(DashboardCreateDialog, {
      width: '400px',
      autoFocus: 'first-tabbable',
    });
    dialogRef.afterClosed().subscribe((result: DashboardResponse | undefined) => {
      if (result) {
        this.dashboards.update((current) => [...current, result]);
        this.router.navigate(['/dashboard', result.id]);
      }
    });
  }

  /** Restores the default seeded hospital dashboard and navigates to it. */
  restoreDefaults(): void {
    this.isRestoring.set(true);
    this.dashboardsApi
      .restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost()
      .pipe(finalize(() => this.isRestoring.set(false)))
      .subscribe({
        next: (newDash) => {
          this.dashboards.update((curr) => [newDash, ...curr]);
          this.router.navigate(['/dashboard', newDash.id]);
          this.snackBar.open('Default dashboard created.', 'Close', { duration: 3000 });
        },
        error: (err) => {
          console.error(err);
          this.snackBar.open('Failed to restore defaults.', 'Close');
        },
      });
  }

  /**
   * Opens a prompt dialog to rename a dashboard with optimistic UI update.
   *
   * @param dash - The dashboard record to rename.
   */
  renameDashboard(dash: DashboardResponse): void {
    this.dialog
      .open(PromptDialogComponent, {
        data: { title: 'Rename Dashboard', value: dash.name, label: 'Name' },
      })
      .afterClosed()
      .subscribe((newName: string | undefined) => {
        if (newName && newName.trim() !== '' && newName !== dash.name) {
          const originalName = dash.name;
          this.dashboards.update((items) =>
            items.map((d) => (d.id === dash.id ? { ...d, name: newName } : d)),
          );
          this.dashboardsApi
            .updateDashboardApiV1DashboardsDashboardIdPut(dash.id, { name: newName })
            .subscribe({
              error: (err) => {
                console.error(err);
                this.dashboards.update((items) =>
                  items.map((d) => (d.id === dash.id ? { ...d, name: originalName } : d)),
                );
                this.snackBar.open(`Rename failed. Reverted.`, 'Close', { duration: 5000 });
              },
            });
        }
      });
  }

  /**
   * Clones an existing dashboard and appends the duplicate to the dashboard list.
   *
   * @param dash - The dashboard record to clone.
   */
  cloneDashboard(dash: DashboardResponse): void {
    this.dashboardsApi.cloneDashboardApiV1DashboardsDashboardIdClonePost(dash.id).subscribe({
      next: (clonedDash) => {
        this.dashboards.update((curr) => [...curr, clonedDash]);
        this.snackBar.open(`Cloned "${dash.name}" successfully`, 'Close', { duration: 3000 });
      },
      error: (err) => {
        console.error(err);
        this.snackBar.open(`Failed to clone.`, 'Close', { duration: 5000 });
      },
    });
  }

  /**
   * Prompts for confirmation and permanently deletes the specified dashboard.
   *
   * @param dash - The dashboard record to delete.
   */
  deleteDashboard(dash: DashboardResponse): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Delete Dashboard',
          message: `Permanently delete "${dash.name}"?`,
          isDestructive: true,
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          const originalList = this.dashboards();
          this.dashboards.update((items) => items.filter((d) => d.id !== dash.id));
          this.dashboardsApi.deleteDashboardApiV1DashboardsDashboardIdDelete(dash.id).subscribe({
            error: (err) => {
              console.error(err);
              this.dashboards.set(originalList);
              this.snackBar.open(`Failed to delete. Restored item.`, 'Close', { duration: 5000 });
            },
          });
        }
      });
  }
}
