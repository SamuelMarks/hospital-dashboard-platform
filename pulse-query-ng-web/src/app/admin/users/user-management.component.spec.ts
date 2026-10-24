/**
 * @fileoverview Unit tests for UserManagementComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { UserManagementComponent } from './user-management.component';
import { AdminUsersService } from '../../api-client/api/admin-users.service';
import { UserResponse } from '../../api-client/model/user-response';
import { createMockInputEvent } from '../../../test-utils/mock-factories';

describe('UserManagementComponent', () => {
  let component: UserManagementComponent;
  let fixture: ComponentFixture<UserManagementComponent>;
  let adminUsersServiceMock: {
    listUsersApiV1AdminUsersGet: ReturnType<typeof vi.fn>;
    updateUserRoleApiV1AdminUsersUserIdRolePut: ReturnType<typeof vi.fn>;
    updateUserStatusApiV1AdminUsersUserIdStatusPut: ReturnType<typeof vi.fn>;
  };

  const adminUser: UserResponse = {
    id: 'u1',
    email: 'admin@hospital.org',
    role: 'SUPER_ADMIN',
    is_admin: true,
    is_active: true,
    language_preference: 'en',
  };
  const nurseUser: UserResponse = {
    id: 'u2',
    email: 'nurse@hospital.org',
    role: 'CHARGE_NURSE',
    is_admin: false,
    is_active: false,
    language_preference: 'es',
  };
  const mockUsers: UserResponse[] = [adminUser, nurseUser];

  beforeEach(async () => {
    adminUsersServiceMock = {
      listUsersApiV1AdminUsersGet: vi.fn().mockReturnValue(of(mockUsers)),
      updateUserRoleApiV1AdminUsersUserIdRolePut: vi.fn().mockReturnValue(of(nurseUser)),
      updateUserStatusApiV1AdminUsersUserIdStatusPut: vi.fn().mockReturnValue(of(nurseUser)),
    };

    await TestBed.configureTestingModule({
      imports: [UserManagementComponent],
      providers: [
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
    component.onSearchInput(createMockInputEvent('nurse'));
    component.onRoleFilterChange('CHARGE_NURSE');

    expect(adminUsersServiceMock.listUsersApiV1AdminUsersGet).toHaveBeenCalledWith(
      50,
      0,
      'CHARGE_NURSE',
      'nurse',
    );
  });

  it('should update user role on change', () => {
    component.changeUserRole(nurseUser, 'DEPARTMENT_CHAIR');
    expect(adminUsersServiceMock.updateUserRoleApiV1AdminUsersUserIdRolePut).toHaveBeenCalledWith(
      'u2',
      { role: 'DEPARTMENT_CHAIR' },
    );
  });

  it('should ignore role change if role is identical', () => {
    component.changeUserRole(nurseUser, 'CHARGE_NURSE');
    expect(adminUsersServiceMock.updateUserRoleApiV1AdminUsersUserIdRolePut).not.toHaveBeenCalled();
  });

  it('should handle role update error', () => {
    adminUsersServiceMock.updateUserRoleApiV1AdminUsersUserIdRolePut.mockReturnValue(
      throwError(() => new Error('Role error')),
    );
    component.changeUserRole(nurseUser, 'DEPARTMENT_CHAIR');
    expect(component.errorMessage()).toContain('Failed to update role for nurse@hospital.org');
  });

  it('should toggle user active status', () => {
    component.toggleUserStatus(nurseUser);
    expect(
      adminUsersServiceMock.updateUserStatusApiV1AdminUsersUserIdStatusPut,
    ).toHaveBeenCalledWith('u2', { is_active: true });
  });

  it('should handle status update error with server detail and fallback', () => {
    adminUsersServiceMock.updateUserStatusApiV1AdminUsersUserIdStatusPut.mockReturnValue(
      throwError(() => ({
        error: { detail: 'Administrators cannot suspend their own active account.' },
      })),
    );
    component.toggleUserStatus(adminUser);
    expect(component.errorMessage()).toBe(
      'Administrators cannot suspend their own active account.',
    );

    adminUsersServiceMock.updateUserStatusApiV1AdminUsersUserIdStatusPut.mockReturnValue(
      throwError(() => ({})),
    );
    component.toggleUserStatus(adminUser);
    expect(component.errorMessage()).toBe('Failed to update user status.');
  });

  it('should return appropriate CSS badge classes', () => {
    expect(component.getRoleBadgeClass('SUPER_ADMIN')).toBe('role-admin');
    expect(component.getRoleBadgeClass('DATA_ANALYST')).toBe('role-analyst');
    expect(component.getRoleBadgeClass('ATTENDING_PHYSICIAN')).toBe('role-clinical');
  });
});
