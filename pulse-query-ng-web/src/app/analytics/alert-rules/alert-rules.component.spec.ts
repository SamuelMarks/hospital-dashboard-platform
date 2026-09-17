/**
 * @fileoverview Unit tests for AlertRulesComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AlertRulesComponent } from './alert-rules.component';
import { AlertRulesService } from '../../api-client/api/alert-rules.service';
import { AlertRuleResponse } from '../../api-client/model/alert-rule-response';
import { AlertSeverity } from '../../api-client/model/alert-severity';

describe('AlertRulesComponent', () => {
  let component: AlertRulesComponent;
  let fixture: ComponentFixture<AlertRulesComponent>;
  let alertRulesServiceMock: {
    listAlertRulesApiV1AnalyticsAlertRulesGet: ReturnType<typeof vi.fn>;
    createAlertRuleApiV1AnalyticsAlertRulesPost: ReturnType<typeof vi.fn>;
    updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut: ReturnType<typeof vi.fn>;
    deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete: ReturnType<typeof vi.fn>;
  };

  const mockRules: AlertRuleResponse[] = [
    {
      id: 'rule-1',
      unit_category: 'ICU',
      threshold_percentage: 90,
      severity: AlertSeverity.Critical,
      is_active: true,
      created_at: '2026-09-15T00:00:00Z',
    },
    {
      id: 'rule-2',
      unit_category: 'Cardiology',
      threshold_percentage: 80,
      severity: AlertSeverity.Warning,
      is_active: false,
      created_at: '2026-09-15T01:00:00Z',
    },
  ];

  beforeEach(async () => {
    alertRulesServiceMock = {
      listAlertRulesApiV1AnalyticsAlertRulesGet: vi.fn().mockReturnValue(of(mockRules)),
      createAlertRuleApiV1AnalyticsAlertRulesPost: vi.fn().mockReturnValue(of(mockRules[0])),
      updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut: vi.fn().mockReturnValue(of(mockRules[0])),
      deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete: vi.fn().mockReturnValue(of(null)),
    };

    await TestBed.configureTestingModule({
      imports: [AlertRulesComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AlertRulesService, useValue: alertRulesServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlertRulesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load initial rules', () => {
    expect(component).toBeTruthy();
    expect(alertRulesServiceMock.listAlertRulesApiV1AnalyticsAlertRulesGet).toHaveBeenCalled();
    expect(component.alertRules().length).toBe(2);
    expect(component.isLoading()).toBe(false);
  });

  it('should handle fetch rules error', () => {
    alertRulesServiceMock.listAlertRulesApiV1AnalyticsAlertRulesGet.mockReturnValue(
      throwError(() => new Error('Network error')),
    );
    component.fetchRules();
    expect(component.errorMessage()).toBe('Failed to load alert rules.');
    expect(component.isLoading()).toBe(false);
  });

  it('should validate form fields', () => {
    const form = component.ruleForm;
    form.patchValue({ unit_category: '', threshold_percentage: 0 });
    expect(form.invalid).toBe(true);

    component.submitRule();
    expect(
      alertRulesServiceMock.createAlertRuleApiV1AnalyticsAlertRulesPost,
    ).not.toHaveBeenCalled();

    form.patchValue({ threshold_percentage: 150 });
    expect(form.get('threshold_percentage')?.hasError('max')).toBe(true);
  });

  it('should create a new alert rule on valid submit', () => {
    component.ruleForm.patchValue({
      unit_category: 'Pediatrics',
      threshold_percentage: 75,
      severity: AlertSeverity.Info,
      is_active: true,
    });

    component.submitRule();
    expect(alertRulesServiceMock.createAlertRuleApiV1AnalyticsAlertRulesPost).toHaveBeenCalledWith({
      unit_category: 'Pediatrics',
      threshold_percentage: 75,
      severity: AlertSeverity.Info,
      is_active: true,
    });
  });

  it('should handle creation failure gracefully', () => {
    alertRulesServiceMock.createAlertRuleApiV1AnalyticsAlertRulesPost.mockReturnValue(
      throwError(() => new Error('Server error')),
    );

    component.ruleForm.patchValue({
      unit_category: 'Pediatrics',
      threshold_percentage: 75,
      severity: AlertSeverity.Info,
      is_active: true,
    });

    component.submitRule();
    expect(component.errorMessage()).toBe('Failed to create alert rule.');
    expect(component.isLoading()).toBe(false);
  });

  it('should populate form when editing and update rule on submit', () => {
    component.startEditing(mockRules[0]);
    expect(component.editingRuleId()).toBe('rule-1');
    expect(component.ruleForm.value.unit_category).toBe('ICU');

    component.ruleForm.patchValue({ threshold_percentage: 95 });
    component.submitRule();

    expect(
      alertRulesServiceMock.updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut,
    ).toHaveBeenCalledWith('rule-1', {
      unit_category: 'ICU',
      threshold_percentage: 95,
      severity: AlertSeverity.Critical,
      is_active: true,
    });
    expect(component.editingRuleId()).toBeNull();
  });

  it('should handle update failure gracefully', () => {
    alertRulesServiceMock.updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut.mockReturnValue(
      throwError(() => new Error('Update error')),
    );

    component.startEditing(mockRules[0]);
    component.submitRule();

    expect(component.errorMessage()).toBe('Failed to update alert rule.');
    expect(component.isLoading()).toBe(false);
  });

  it('should cancel editing mode', () => {
    component.startEditing(mockRules[0]);
    expect(component.editingRuleId()).toBe('rule-1');

    component.cancelEditing();
    expect(component.editingRuleId()).toBeNull();
    expect(component.ruleForm.value.unit_category).toBe('');
  });

  it('should toggle rule active state', () => {
    component.toggleRuleActive(mockRules[0]);
    expect(
      alertRulesServiceMock.updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut,
    ).toHaveBeenCalledWith('rule-1', { is_active: false });
  });

  it('should handle toggle active failure', () => {
    alertRulesServiceMock.updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut.mockReturnValue(
      throwError(() => new Error('Toggle error')),
    );

    component.toggleRuleActive(mockRules[0]);
    expect(component.errorMessage()).toBe('Failed to update rule status.');
  });

  it('should delete a rule and reload', () => {
    component.deleteRule('rule-1');
    expect(
      alertRulesServiceMock.deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete,
    ).toHaveBeenCalledWith('rule-1');
    expect(alertRulesServiceMock.listAlertRulesApiV1AnalyticsAlertRulesGet).toHaveBeenCalledTimes(
      2,
    );
  });

  it('should handle delete failure gracefully', () => {
    alertRulesServiceMock.deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete.mockReturnValue(
      throwError(() => new Error('Delete error')),
    );

    component.deleteRule('rule-1');
    expect(component.errorMessage()).toBe('Failed to delete alert rule.');
    expect(component.isLoading()).toBe(false);
  });

  it('should return correct severity classes', () => {
    expect(component.getSeverityClass('CRITICAL')).toBe('severity-critical');
    expect(component.getSeverityClass('WARNING')).toBe('severity-warning');
    expect(component.getSeverityClass('INFO')).toBe('severity-info');
    expect(component.getSeverityClass(undefined)).toBe('severity-info');
  });
});
