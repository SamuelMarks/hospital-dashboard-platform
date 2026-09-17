/**
 * @fileoverview Unit tests for UserManagementComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { UserManagementComponent } from './user-management.component';
import { AdminUsersService } from '../../api-client/api/admin-users.service';
import { UserResponse } from '../../api-client/model/user-response';

describe('UserManagementComponent', () => {
  let component: UserManagementComponent;
  let fixture: ComponentFixture<UserManagementComponent>;
  let adminUsersServiceMock: {
    listUsersApiV1AdminUsersGet: ReturnType<typeof vi.fn>;
    updateUserRoleApiV1AdminUsersUserIdRolePut: ReturnType<typeof vi.fn>;
    updateUserStatusApiV1AdminUsersUserIdStatusPut: ReturnType<typeof vi.fn>;
  };

  const mockUsers: UserResponse[] = [
    {
      id: 'u1',
      email: 'admin@hospital.org',
      role: 'SUPER_ADMIN',
      is_admin: true,
      is_active: true,
      language_preference: 'en',
    },
    {
      id: 'u2',
      email: 'nurse@hospital.org',
      role: 'CHARGE_NURSE',
      is_admin: false,
      is_active: false,
      language_preference: 'es',
    },
  ];

  beforeEach(async () => {
    adminUsersServiceMock = {
      listUsersApiV1AdminUsersGet: vi.fn().mockReturnValue(of(mockUsers)),
      updateUserRoleApiV1AdminUsersUserIdRolePut: vi.fn().mockReturnValue(of(mockUsers[1])),
      updateUserStatusApiV1AdminUsersUserIdStatusPut: vi.fn().mockReturnValue(of(mockUsers[1])),
    };

    await TestBed.configureTestingModule({
      imports: [UserManagementComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AdminUsersService, useValue: adminUsersServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load initial users', () => {
    expect(component).toBeTruthy();
    expect(adminUsersServiceMock.listUsersApiV1AdminUsersGet).toHaveBeenCalled();
    expect(component.users().length).toBe(2);
    expect(component.isLoading()).toBe(false);
  });

  it('should handle list users failure', () => {
    adminUsersServiceMock.listUsersApiV1AdminUsersGet.mockReturnValue(
      throwError(() => new Error('Forbidden')),
    );
    component.fetchUsers();
    expect(component.errorMessage()).toBe('Failed to load user list.');
    expect(component.isLoading()).toBe(false);
  });

  it('should filter by search query and role', () => {
    component.searchControl.setValue('nurse');
    component.roleFilterControl.setValue('CHARGE_NURSE');
    component.fetchUsers();

    expect(adminUsersServiceMock.listUsersApiV1AdminUsersGet).toHaveBeenCalledWith(
      50,
      0,
      'CHARGE_NURSE',
      'nurse',
    );
  });

  it('should update user role on change', () => {
    component.changeUserRole(mockUsers[1], 'DEPARTMENT_CHAIR');
    expect(adminUsersServiceMock.updateUserRoleApiV1AdminUsersUserIdRolePut).toHaveBeenCalledWith(
      'u2',
      { role: 'DEPARTMENT_CHAIR' },
    );
  });

  it('should ignore role change if role is identical', () => {
    component.changeUserRole(mockUsers[1], 'CHARGE_NURSE');
    expect(adminUsersServiceMock.updateUserRoleApiV1AdminUsersUserIdRolePut).not.toHaveBeenCalled();
  });

  it('should handle role update error', () => {
    adminUsersServiceMock.updateUserRoleApiV1AdminUsersUserIdRolePut.mockReturnValue(
      throwError(() => new Error('Role error')),
    );
    component.changeUserRole(mockUsers[1], 'DEPARTMENT_CHAIR');
    expect(component.errorMessage()).toContain('Failed to update role for nurse@hospital.org');
  });

  it('should toggle user active status', () => {
    component.toggleUserStatus(mockUsers[1]);
    expect(
      adminUsersServiceMock.updateUserStatusApiV1AdminUsersUserIdStatusPut,
    ).toHaveBeenCalledWith('u2', { is_active: true });
  });

  it('should handle status update error with server detail', () => {
    adminUsersServiceMock.updateUserStatusApiV1AdminUsersUserIdStatusPut.mockReturnValue(
      throwError(() => ({
        error: { detail: 'Administrators cannot suspend their own active account.' },
      })),
    );
    component.toggleUserStatus(mockUsers[0]);
    expect(component.errorMessage()).toBe(
      'Administrators cannot suspend their own active account.',
    );
  });

  it('should return appropriate CSS badge classes', () => {
    expect(component.getRoleBadgeClass('SUPER_ADMIN')).toBe('role-admin');
    expect(component.getRoleBadgeClass('DATA_ANALYST')).toBe('role-analyst');
    expect(component.getRoleBadgeClass('ATTENDING_PHYSICIAN')).toBe('role-clinical');
  });
});
