/**
 * @fileoverview Dialog component enabling granular multi-user dashboard sharing and permission management.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Data payload injected into [ShareDashboardDialog].
 */
export interface ShareDashboardData {
  /** The unique dashboard identifier. */
  dashboardId: string;
  /** Display name of the dashboard. */
  dashboardName: string;
}

/**
 * Representation of an active dashboard share record.
 */
export interface DashboardShareItem {
  /** Unique share identifier. */
  id: string;
  /** Dashboard identifier. */
  dashboard_id: string;
  /** Shared user ID. */
  user_id: string;
  /** Shared user email address. */
  user_email: string;
  /** Granted permission level ('VIEW' or 'EDIT'). */
  permission_level: string;
}

/**
 * Dialog allowing owners to grant or revoke VIEW and EDIT permissions on dashboards.
 */
@Component({
  selector: 'app-share-dashboard-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatListModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './share-dashboard.dialog.html',
  styles: [
    `
      .share-dialog-content {
        min-width: 420px;
        max-width: 90vw;
      }
      .shares-list {
        max-height: 250px;
        overflow-y: auto;
      }
    `,
  ],
})
export class ShareDashboardDialog implements OnInit {
  /** Injected dialog data specifying dashboard ID and name. */
  public readonly data = inject<ShareDashboardData>(MAT_DIALOG_DATA);
  /** Angular HTTP client instance. */
  private readonly http = inject(HttpClient);
  /** Reference to the dialog instance. */
  private readonly dialogRef = inject(MatDialogRef<ShareDashboardDialog>);

  /** Signal holding the input email string for a new collaborator. */
  readonly emailInput = signal('');
  /** Signal holding the input permission level for a new collaborator. */
  readonly roleInput = signal<'VIEW' | 'EDIT'>('VIEW');

  /** List of currently active shares. */
  readonly shares = signal<DashboardShareItem[]>([]);
  /** Loading state for initial fetch. */
  readonly isLoading = signal(false);
  /** Submitting state for adding/updating share. */
  readonly isSubmitting = signal(false);
  /** Error message banner content. */
  readonly errorMessage = signal<string | null>(null);

  /**
   * Initializes component by loading existing collaborators.
   */
  ngOnInit(): void {
    this.loadShares();
  }

  /**
   * Updates the collaborator email signal from an input event.
   *
   * @param event - DOM input event from the email field.
   */
  onEmailInput(event: Event): void {
    this.emailInput.set((event.target as HTMLInputElement).value);
  }

  /**
   * Fetches active shares from the backend API.
   */
  loadShares(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.http
      .get<DashboardShareItem[]>(`/api/v1/dashboards/${this.data.dashboardId}/shares`)
      .subscribe({
        next: (items) => {
          this.shares.set(items);
          this.isLoading.set(false);
        },
        error: (err: { error?: { detail?: string } }) => {
          this.isLoading.set(false);
          this.errorMessage.set(err?.error?.detail || $localize`Failed to load collaborators`);
        },
      });
  }

  /**
   * Adds or updates a collaborator share by email.
   */
  addShare(): void {
    const email = this.emailInput().trim();
    if (!email) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const payload = {
      user_email: email,
      permission_level: this.roleInput(),
    };

    this.http
      .post<DashboardShareItem>(`/api/v1/dashboards/${this.data.dashboardId}/shares`, payload)
      .subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          this.emailInput.set('');
          const existingIndex = this.shares().findIndex((s) => s.user_id === created.user_id);
          if (existingIndex >= 0) {
            const updated = [...this.shares()];
            updated[existingIndex] = created;
            this.shares.set(updated);
          } else {
            this.shares.set([...this.shares(), created]);
          }
        },
        error: (err: { error?: { detail?: string } }) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(err?.error?.detail || $localize`Failed to share dashboard`);
        },
      });
  }

  /**
   * Revokes a collaborator's access to the dashboard.
   *
   * @param shareId The share record identifier to delete.
   */
  revokeShare(shareId: string): void {
    this.http.delete(`/api/v1/dashboards/${this.data.dashboardId}/shares/${shareId}`).subscribe({
      next: () => {
        this.shares.set(this.shares().filter((s) => s.id !== shareId));
      },
      error: (err: { error?: { detail?: string } }) => {
        this.errorMessage.set(err?.error?.detail || $localize`Failed to revoke share`);
      },
    });
  }
}
