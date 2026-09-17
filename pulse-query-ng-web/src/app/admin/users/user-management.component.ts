/**
 * @fileoverview User Administration Component.
 * Enables platform administrators to view, filter, elevate roles,
 * and activate or suspend hospital user accounts.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminUsersService } from '../../api-client/api/admin-users.service';
import { UserResponse } from '../../api-client/model/user-response';

/**
 * Component for administering platform users and RBAC roles.
 */
@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  templateUrl: './user-management.component.html',
  styles: [
    `
      :host {
        display: block;
        padding: 24px;
      }
      .page {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .title h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 400;
      }
      .title p {
        margin: 4px 0 0;
        color: var(--sys-text-secondary, #666);
      }
      .filters-card {
        padding: 16px 20px;
        border: 1px solid var(--sys-surface-border, #e0e0e0);
        background: var(--sys-surface, #fff);
      }
      .filters-row {
        display: flex;
        gap: 16px;
        align-items: center;
        flex-wrap: wrap;
      }
      .table-card {
        overflow: hidden;
        border: 1px solid var(--sys-surface-border, #e0e0e0);
      }
      table {
        width: 100%;
      }
      .role-chip {
        font-size: 11px;
        font-weight: 600;
      }
      .role-admin {
        background-color: #fee2e2 !important;
        color: #991b1b !important;
      }
      .role-clinical {
        background-color: #e0f2fe !important;
        color: #0369a1 !important;
      }
      .role-analyst {
        background-color: #f3e8ff !important;
        color: #6b21a8 !important;
      }
    `,
  ],
})
export class UserManagementComponent implements OnInit {
  /** Admin users backend API client service. */
  private readonly adminUsersService = inject(AdminUsersService);

  /** Signal containing list of fetched user profiles. */
  readonly users = signal<UserResponse[]>([]);

  /** Signal indicating asynchronous loading state. */
  readonly isLoading = signal<boolean>(false);

  /** Signal holding any active error notification message. */
  readonly errorMessage = signal<string | null>(null);

  /** Search input control for filtering users by email. */
  readonly searchControl = new FormControl<string>('');

  /** Role filter control for isolating specific clinical roles. */
  readonly roleFilterControl = new FormControl<string>('');

  /** Displayed columns in the users Material table. */
  readonly displayedColumns: string[] = [
    'email',
    'role',
    'is_admin',
    'is_active',
    'language_preference',
  ];

  /** Permitted clinical roles for assignment. */
  readonly availableRoles: string[] = [
    'SUPER_ADMIN',
    'CHIEF_MEDICAL_OFFICER',
    'DEPARTMENT_CHAIR',
    'ATTENDING_PHYSICIAN',
    'CHARGE_NURSE',
    'DATA_ANALYST',
  ];

  /**
   * Initializes component and triggers initial user list fetch.
   */
  ngOnInit(): void {
    this.fetchUsers();
  }

  /**
   * Fetches user accounts from the administrative API applying active filters.
   */
  fetchUsers(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const searchVal = this.searchControl.value?.trim() || undefined;
    const roleVal = this.roleFilterControl.value || undefined;

    this.adminUsersService.listUsersApiV1AdminUsersGet(50, 0, roleVal, searchVal).subscribe({
      next: (userList) => {
        this.users.set(userList);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load user list.');
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Updates the clinical role assignment for a specific user.
   *
   * @param user Target user profile.
   * @param newRole Newly selected clinical role string.
   */
  changeUserRole(user: UserResponse, newRole: string): void {
    if (user.role === newRole) return;

    this.adminUsersService
      .updateUserRoleApiV1AdminUsersUserIdRolePut(user.id, { role: newRole })
      .subscribe({
        next: () => this.fetchUsers(),
        error: () => this.errorMessage.set(`Failed to update role for ${user.email}.`),
      });
  }

  /**
   * Toggles active account status (activate/suspend) for a user.
   *
   * @param user Target user profile.
   */
  toggleUserStatus(user: UserResponse): void {
    const updatedStatus = !user.is_active;

    this.adminUsersService
      .updateUserStatusApiV1AdminUsersUserIdStatusPut(user.id, { is_active: updatedStatus })
      .subscribe({
        next: () => this.fetchUsers(),
        error: (err: { error?: { detail?: string } }) => {
          const detail = err?.error?.detail || 'Failed to update user status.';
          this.errorMessage.set(detail);
        },
      });
  }

  /**
   * Computes CSS class for role badges.
   *
   * @param role User clinical role string.
   * @returns CSS styling class name.
   */
  getRoleBadgeClass(role?: string): string {
    if (role === 'SUPER_ADMIN') return 'role-admin';
    if (role === 'DATA_ANALYST') return 'role-analyst';
    return 'role-clinical';
  }
}
