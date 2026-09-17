import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShareDashboardDialog } from './share-dashboard.dialog';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ShareDashboardDialog', () => {
  let component: ShareDashboardDialog;
  let fixture: ComponentFixture<ShareDashboardDialog>;
  let mockHttp: { get: any; post: any; delete: any };
  let mockDialogRef: { close: any };

  const sampleShares = [
    {
      id: 's1',
      dashboard_id: 'd1',
      user_id: 'u1',
      user_email: 'collab@hospital.org',
      permission_level: 'VIEW',
    },
  ];

  beforeEach(async () => {
    mockHttp = {
      get: vi.fn().mockReturnValue(of(sampleShares)),
      post: vi.fn(),
      delete: vi.fn(),
    };
    mockDialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ShareDashboardDialog, NoopAnimationsModule],
      providers: [
        { provide: HttpClient, useValue: mockHttp },
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { dashboardId: 'd1', dashboardName: 'Clinical Operations' },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShareDashboardDialog);
    component = fixture.componentInstance;
  });

  it('should initialize and load shares', () => {
    fixture.detectChanges();
    expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/dashboards/d1/shares');
    expect(component.shares().length).toBe(1);
    expect(component.shares()[0].user_email).toBe('collab@hospital.org');
  });

  it('should handle error when loading shares fails', () => {
    mockHttp.get.mockReturnValue(throwError(() => ({ error: { detail: 'Forbidden' } })));
    component.loadShares();
    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBe('Forbidden');
  });

  it('should add a new share successfully', () => {
    fixture.detectChanges();
    const newShare = {
      id: 's2',
      dashboard_id: 'd1',
      user_id: 'u2',
      user_email: 'doctor@hospital.org',
      permission_level: 'EDIT',
    };
    mockHttp.post.mockReturnValue(of(newShare));

    component.emailInput = 'doctor@hospital.org';
    component.roleInput = 'EDIT';
    component.addShare();

    expect(mockHttp.post).toHaveBeenCalledWith('/api/v1/dashboards/d1/shares', {
      user_email: 'doctor@hospital.org',
      permission_level: 'EDIT',
    });
    expect(component.shares().length).toBe(2);
    expect(component.emailInput).toBe('');
    expect(component.isSubmitting()).toBe(false);
  });

  it('should update existing share in list if user already shared', () => {
    fixture.detectChanges();
    const updatedShare = {
      id: 's1',
      dashboard_id: 'd1',
      user_id: 'u1',
      user_email: 'collab@hospital.org',
      permission_level: 'EDIT',
    };
    mockHttp.post.mockReturnValue(of(updatedShare));

    component.emailInput = 'collab@hospital.org';
    component.roleInput = 'EDIT';
    component.addShare();

    expect(component.shares().length).toBe(1);
    expect(component.shares()[0].permission_level).toBe('EDIT');
  });

  it('should do nothing if emailInput is blank', () => {
    component.emailInput = '   ';
    component.addShare();
    expect(mockHttp.post).not.toHaveBeenCalled();
  });

  it('should handle error when addShare fails', () => {
    mockHttp.post.mockReturnValue(throwError(() => ({ error: { detail: 'User not found' } })));
    component.emailInput = 'unknown@hospital.org';
    component.addShare();

    expect(component.isSubmitting()).toBe(false);
    expect(component.errorMessage()).toBe('User not found');

    // Fallback without detail
    mockHttp.post.mockReturnValue(throwError(() => ({})));
    component.emailInput = 'unknown2@hospital.org';
    component.addShare();
    expect(component.errorMessage()).toBe('Failed to share dashboard');
  });

  it('should revoke a share successfully', () => {
    fixture.detectChanges();
    mockHttp.delete.mockReturnValue(of(null));

    component.revokeShare('s1');

    expect(mockHttp.delete).toHaveBeenCalledWith('/api/v1/dashboards/d1/shares/s1');
    expect(component.shares().length).toBe(0);
  });

  it('should handle error when revokeShare fails', () => {
    mockHttp.delete.mockReturnValue(throwError(() => ({ error: { detail: 'Cannot revoke' } })));
    component.revokeShare('s1');
    expect(component.errorMessage()).toBe('Cannot revoke');

    // Fallback without detail
    mockHttp.delete.mockReturnValue(throwError(() => ({})));
    component.revokeShare('s1');
    expect(component.errorMessage()).toBe('Failed to revoke share');
  });

  it('should fallback to default error when loading shares fails without detail', () => {
    mockHttp.get.mockReturnValue(throwError(() => ({})));
    component.loadShares();
    expect(component.errorMessage()).toBe('Failed to load collaborators');
  });
});
