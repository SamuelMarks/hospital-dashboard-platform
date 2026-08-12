import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardCreateDialog } from './dashboard-create.dialog';
import { DashboardsService, DashboardResponse } from '../api-client';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('DashboardCreateDialog', () => {
  let component: DashboardCreateDialog;
  let fixture: ComponentFixture<DashboardCreateDialog>;
  let mockApi: any;
  let mockDialogRef: any;

  beforeEach(async () => {
    mockApi = { createDashboardApiV1DashboardsPost: vi.fn() };
    mockDialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [DashboardCreateDialog, NoopAnimationsModule],
      providers: [
        { provide: DashboardsService, useValue: mockApi },
        { provide: MatDialogRef, useValue: mockDialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardCreateDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate form input', () => {
    expect(component.form().valid()).toBe(false);

    component.formModel.set({ name: 'ab' });
    fixture.detectChanges();

    // In Angular v22 signal forms, errors are collected in an array.
    const hasMinLengthError = component.form
      .name()
      .errors()
      .some((e) => e.kind === 'minLength');
    expect(hasMinLengthError).toBe(true);

    component.formModel.set({ name: 'Valid Name' });
    fixture.detectChanges();
    expect(component.form().valid()).toBe(true);
  });

  it('should call API and close dialog on success', () => {
    // Arrange
    const response: DashboardResponse = {
      id: 'd1',
      name: 'Valid Name',
      owner_id: 'u1',
      widgets: [],
    };
    mockApi.createDashboardApiV1DashboardsPost.mockReturnValue(of(response));

    // Act
    component.formModel.set({ name: 'Valid Name' });
    component.submit();

    // Assert
    expect(mockApi.createDashboardApiV1DashboardsPost).toHaveBeenCalledWith({ name: 'Valid Name' });
    expect(mockDialogRef.close).toHaveBeenCalledWith(response);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should handle API errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockApi.createDashboardApiV1DashboardsPost.mockReturnValue(throwError(() => new Error('Fail')));

    component.formModel.set({ name: 'Fail Name' });
    component.submit();

    expect(component.isSubmitting()).toBe(false);
    expect(component.error()).toContain('Failed to create');
    expect(mockDialogRef.close).not.toHaveBeenCalled();

    fixture.detectChanges();
    const errorMsg = fixture.debugElement.query(By.css('[data-testid="error-msg"]'));
    expect(errorMsg).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it('should not submit when form is invalid', () => {
    component.formModel.set({ name: '' });
    component.submit();

    expect(mockApi.createDashboardApiV1DashboardsPost).not.toHaveBeenCalled();
    expect(component.isSubmitting()).toBe(false);
  });
});
