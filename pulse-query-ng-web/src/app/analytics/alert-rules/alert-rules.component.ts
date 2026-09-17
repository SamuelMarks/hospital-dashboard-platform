/**
 * @fileoverview Clinical Alert Rules Management Component.
 * Provides administrators and analysts with full CRUD capabilities over
 * hospital bed occupancy alerting thresholds, unit categories, and severity levels.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AlertRulesService } from '../../api-client/api/alert-rules.service';
import { AlertRuleResponse } from '../../api-client/model/alert-rule-response';
import { AlertRuleCreate } from '../../api-client/model/alert-rule-create';
import { AlertRuleUpdate } from '../../api-client/model/alert-rule-update';
import { AlertSeverity } from '../../api-client/model/alert-severity';

/**
 * Component for administering clinical capacity and occupancy alert rules.
 */
@Component({
  selector: 'app-alert-rules',
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
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  templateUrl: './alert-rules.component.html',
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
      .form-card {
        padding: 20px;
        border: 1px solid var(--sys-surface-border, #e0e0e0);
        background: var(--sys-surface, #fff);
      }
      .rule-form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        align-items: center;
      }
      .form-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .table-card {
        overflow: hidden;
        border: 1px solid var(--sys-surface-border, #e0e0e0);
      }
      table {
        width: 100%;
      }
      .actions-cell {
        display: flex;
        gap: 8px;
      }
      .severity-chip {
        font-weight: 500;
        font-size: 11px;
      }
      .severity-critical {
        background-color: #fde8e8 !important;
        color: #9b1c1c !important;
      }
      .severity-warning {
        background-color: #fef08a !important;
        color: #713f12 !important;
      }
      .severity-info {
        background-color: #e1effe !important;
        color: #1e429f !important;
      }
      .progress-cell {
        min-width: 140px;
      }
    `,
  ],
})
export class AlertRulesComponent implements OnInit {
  /** Alert rules backend API client service. */
  private readonly alertRulesService = inject(AlertRulesService);
  /** Form builder instance for reactive form construction. */
  private readonly fb = inject(FormBuilder);

  /** Signal containing the list of configured alert rules. */
  readonly alertRules = signal<AlertRuleResponse[]>([]);

  /** Signal tracking asynchronous loading state. */
  readonly isLoading = signal<boolean>(false);

  /** Signal holding any active error notification message. */
  readonly errorMessage = signal<string | null>(null);

  /** Signal identifying the rule currently undergoing editing, if any. */
  readonly editingRuleId = signal<string | null>(null);

  /** Displayed columns in the alert rules Material table. */
  readonly displayedColumns: string[] = [
    'unit_category',
    'threshold_percentage',
    'severity',
    'is_active',
    'created_at',
    'actions',
  ];

  /** Available alert severity enumeration values. */
  readonly severityOptions: AlertSeverity[] = [
    AlertSeverity.Info,
    AlertSeverity.Warning,
    AlertSeverity.Critical,
  ];

  /** Reactive form group for creating and editing alert rules. */
  readonly ruleForm: FormGroup = this.fb.group({
    unit_category: ['', [Validators.required, Validators.maxLength(100)]],
    threshold_percentage: [85, [Validators.required, Validators.min(1), Validators.max(100)]],
    severity: [AlertSeverity.Warning, [Validators.required]],
    is_active: [true],
  });

  /**
   * Initializes component and triggers initial rule listing fetch.
   */
  ngOnInit(): void {
    this.fetchRules();
  }

  /**
   * Fetches all alert rules from the backend API.
   */
  fetchRules(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.alertRulesService.listAlertRulesApiV1AnalyticsAlertRulesGet().subscribe({
      next: (rules) => {
        this.alertRules.set(rules);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set('Failed to load alert rules.');
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Submits the active form to either create a new rule or update an existing one.
   */
  submitRule(): void {
    if (this.ruleForm.invalid) {
      this.ruleForm.markAllAsTouched();
      return;
    }

    const formValues = this.ruleForm.value;
    const editingId = this.editingRuleId();

    this.isLoading.set(true);
    this.errorMessage.set(null);

    if (editingId) {
      const updatePayload: AlertRuleUpdate = {
        unit_category: formValues.unit_category,
        threshold_percentage: Number(formValues.threshold_percentage),
        severity: formValues.severity,
        is_active: formValues.is_active,
      };

      this.alertRulesService
        .updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut(editingId, updatePayload)
        .subscribe({
          next: () => {
            this.cancelEditing();
            this.fetchRules();
          },
          error: () => {
            this.errorMessage.set('Failed to update alert rule.');
            this.isLoading.set(false);
          },
        });
    } else {
      const createPayload: AlertRuleCreate = {
        unit_category: formValues.unit_category,
        threshold_percentage: Number(formValues.threshold_percentage),
        severity: formValues.severity,
        is_active: formValues.is_active ?? true,
      };

      this.alertRulesService.createAlertRuleApiV1AnalyticsAlertRulesPost(createPayload).subscribe({
        next: () => {
          this.ruleForm.reset({
            unit_category: '',
            threshold_percentage: 85,
            severity: AlertSeverity.Warning,
            is_active: true,
          });
          this.fetchRules();
        },
        error: () => {
          this.errorMessage.set('Failed to create alert rule.');
          this.isLoading.set(false);
        },
      });
    }
  }

  /**
   * Populates the form with existing rule attributes for editing.
   *
   * @param rule The alert rule entity to edit.
   */
  startEditing(rule: AlertRuleResponse): void {
    this.editingRuleId.set(rule.id);
    this.ruleForm.patchValue({
      unit_category: rule.unit_category,
      threshold_percentage: rule.threshold_percentage,
      severity: rule.severity ?? AlertSeverity.Warning,
      is_active: rule.is_active ?? true,
    });
  }

  /**
   * Clears the current edit mode and resets the form.
   */
  cancelEditing(): void {
    this.editingRuleId.set(null);
    this.ruleForm.reset({
      unit_category: '',
      threshold_percentage: 85,
      severity: AlertSeverity.Warning,
      is_active: true,
    });
  }

  /**
   * Toggles the active evaluation status of a rule.
   *
   * @param rule Target alert rule entity.
   */
  toggleRuleActive(rule: AlertRuleResponse): void {
    const updatedStatus = !rule.is_active;
    this.alertRulesService
      .updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut(rule.id, {
        is_active: updatedStatus,
      })
      .subscribe({
        next: () => this.fetchRules(),
        error: () => this.errorMessage.set('Failed to update rule status.'),
      });
  }

  /**
   * Removes an alert rule by its unique identifier.
   *
   * @param ruleId Unique ID of the rule to delete.
   */
  deleteRule(ruleId: string): void {
    this.isLoading.set(true);
    this.alertRulesService.deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete(ruleId).subscribe({
      next: () => this.fetchRules(),
      error: () => {
        this.errorMessage.set('Failed to delete alert rule.');
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Computes CSS class mapping for severity chip rendering.
   *
   * @param severity The severity value string.
   * @returns CSS styling class name.
   */
  getSeverityClass(severity?: string): string {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return 'severity-critical';
      case 'WARNING':
        return 'severity-warning';
      default:
        return 'severity-info';
    }
  }
}
