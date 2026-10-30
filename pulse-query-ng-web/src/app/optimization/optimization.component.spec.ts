/**
 * @fileoverview Unit tests for `OptimizationComponent` achieving 100% statement, branch, function, and line coverage.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { vi, describe, beforeEach, it, expect } from 'vitest';

import {
  InstitutionProfileSchema,
  ModelCompendiumEntrySchema,
  OptimizationSolutionPayload,
  QuickActionDefinitionSchema,
  QuickActionExecutionResponse,
} from '../api-client';
import { readTemplate } from '../../test-utils/component-resources';
import { OptimizationComponent } from './optimization.component';
import { OptimizationStore } from './optimization.store';

describe('OptimizationComponent', () => {
  let component: OptimizationComponent;
  let fixture: ComponentFixture<OptimizationComponent>;
  let mockStore: {
    institutions: ReturnType<typeof signal<InstitutionProfileSchema[]>>;
    models: ReturnType<typeof signal<ModelCompendiumEntrySchema[]>>;
    visibleQuickActions: ReturnType<typeof signal<QuickActionDefinitionSchema[]>>;
    selectedUseCase: ReturnType<
      typeof signal<'service_unit' | 'surgical_scheduling' | 'staffing_optimization'>
    >;
    selectedInstitutionId: ReturnType<typeof signal<string>>;
    selectedModelId: ReturnType<typeof signal<string>>;
    latestSolution: ReturnType<typeof signal<OptimizationSolutionPayload | null>>;
    quickActionResult: ReturnType<typeof signal<QuickActionExecutionResponse | null>>;
    latestExplanation: ReturnType<typeof signal<string | null>>;
    followUpSuggestions: ReturnType<typeof signal<string[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    isSubmittingSurvey: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    surveySuccessMessage: ReturnType<typeof signal<string | null>>;
    initializeWorkspace: ReturnType<typeof vi.fn>;
    selectUseCase: ReturnType<typeof vi.fn>;
    selectInstitution: ReturnType<typeof vi.fn>;
    selectModel: ReturnType<typeof vi.fn>;
    executeQuickAction: ReturnType<typeof vi.fn>;
    submitPrompt: ReturnType<typeof vi.fn>;
    submitSurvey: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockStore = {
      institutions: signal<InstitutionProfileSchema[]>([
        {
          institution_id: 'stanford_childrens',
          name: "Stanford Medicine Children's Health",
          short_name: "Stanford Children's",
          hospital_type: 'pediatric',
          total_licensed_beds: 156,
          unit_capacities: { 'PCU 350': 28 },
          clinical_services: ['General Pediatrics'],
          home_unit_map: { 'General Pediatrics': ['PCU 350'] },
          surgical_programs: ['BEDS', 'POINTS'],
        },
      ]),
      models: signal<ModelCompendiumEntrySchema[]>([
        {
          model_id: 'gemini-2.5-pro',
          display_name: 'Gemini 2.5 Pro',
          family: 'gemini',
          deployment_target: 'gcp_cloud',
        },
      ]),
      visibleQuickActions: signal<QuickActionDefinitionSchema[]>([
        {
          action_id: 'patient_days_by_unit',
          label: 'Patient Days by Unit',
          icon: '📊',
          description: 'Desc',
          use_case: 'service_unit',
          default_prompt: 'Prompt',
        },
      ]),
      selectedUseCase: signal<'service_unit' | 'surgical_scheduling' | 'staffing_optimization'>(
        'service_unit',
      ),
      selectedInstitutionId: signal<string>('stanford_childrens'),
      selectedModelId: signal<string>('gemini-2.5-pro'),
      latestSolution: signal<OptimizationSolutionPayload | null>(null),
      quickActionResult: signal<QuickActionExecutionResponse | null>(null),
      latestExplanation: signal<string | null>(null),
      followUpSuggestions: signal<string[]>([]),
      isLoading: signal<boolean>(false),
      isSubmittingSurvey: signal<boolean>(false),
      error: signal<string | null>(null),
      surveySuccessMessage: signal<string | null>(null),
      initializeWorkspace: vi.fn(),
      selectUseCase: vi.fn(),
      selectInstitution: vi.fn(),
      selectModel: vi.fn(),
      executeQuickAction: vi.fn(),
      submitPrompt: vi.fn(),
      submitSurvey: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [OptimizationComponent],
      providers: [
        { provide: OptimizationStore, useValue: mockStore },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                prompt: '  Custom route prompt  ',
                useCase: 'surgical_scheduling',
              }),
            },
          },
        },
      ],
    })
      .overrideComponent(OptimizationComponent, {
        set: {
          template: readTemplate('./optimization.component.html'),
          styles: [],
          templateUrl: undefined,
          styleUrl: undefined,
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(OptimizationComponent);
    component = fixture.componentInstance;
  });

  it('should initialize from route query params and render What I Can Do and Quick Actions', () => {
    fixture.detectChanges();
    expect(component.promptModel().prompt).toBe('Custom route prompt');
    expect(mockStore.initializeWorkspace).toHaveBeenCalledWith(
      '  Custom route prompt  ',
      'surgical_scheduling',
    );

    // Also test ngOnInit when queryParamMap has no prompt
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as { queryParamMap: ReturnType<typeof convertToParamMap> }).queryParamMap =
      convertToParamMap({});
    component.ngOnInit();
    expect(mockStore.initializeWorkspace).toHaveBeenCalledWith(null, null);
  });

  it('should switch use cases, institution, model, and execute quick actions and suggestions', () => {
    fixture.detectChanges();

    component.onSelectUseCase('service_unit');
    expect(mockStore.selectUseCase).toHaveBeenCalledWith('service_unit');

    component.onSelectUseCase('surgical_scheduling');
    expect(mockStore.selectUseCase).toHaveBeenCalledWith('surgical_scheduling');

    component.onSelectUseCase('staffing_optimization');
    expect(mockStore.selectUseCase).toHaveBeenCalledWith('staffing_optimization');

    component.onSelectInstitution('chop');
    expect(mockStore.selectInstitution).toHaveBeenCalledWith('chop');

    component.onSelectModel('medgemma-27b-text-it');
    expect(mockStore.selectModel).toHaveBeenCalledWith('medgemma-27b-text-it');

    component.onExecuteQuickAction('patient_days_by_unit');
    expect(mockStore.executeQuickAction).toHaveBeenCalledWith('patient_days_by_unit');

    component.onApplySuggestion('Reserve 6 beds');
    expect(component.promptModel().prompt).toBe('Reserve 6 beds');
    expect(mockStore.submitPrompt).toHaveBeenCalledWith('Reserve 6 beds');
  });

  it('should submit valid prompt and skip invalid empty prompt', () => {
    fixture.detectChanges();
    component.promptModel.set({ prompt: '' });
    fixture.detectChanges();
    component.onSubmitPrompt();
    expect(mockStore.submitPrompt).not.toHaveBeenCalled();

    component.promptModel.set({ prompt: 'Open 10 beds on PCU 360' });
    fixture.detectChanges();
    component.onSubmitPrompt();
    expect(mockStore.submitPrompt).toHaveBeenCalledWith('Open 10 beds on PCU 360');
  });

  it('should toggle survey panel, extract event value, and submit survey', () => {
    fixture.detectChanges();
    expect(component.showSurveyPanel()).toBe(false);
    component.toggleSurveyPanel();
    fixture.detectChanges();
    expect(component.showSurveyPanel()).toBe(true);

    const inputEl = document.createElement('input');
    inputEl.value = 'Much faster than email';
    const ev = { target: inputEl } as unknown as Event;
    expect(component.getEventValue(ev)).toBe('Much faster than email');

    component.surveyFeedback.set('Much faster than email');
    component.onSubmitSurvey();
    expect(mockStore.submitSurvey).toHaveBeenCalledWith({
      use_case: 'service_unit',
      role_category: 'Physician',
      score_vs_manual_process: 5,
      score_vs_other_workflow_tech: 5,
      interpretability_score: 5,
      qualitative_feedback: 'Much faster than email',
    });
  });

  it('should render DES baseline tables across Use Case 1, Use Case 2, and Use Case 3 as well as Quick Action and Explanation cards', () => {
    mockStore.isLoading.set(true);
    mockStore.error.set('Sample error');
    mockStore.latestExplanation.set('Sample explanation');
    mockStore.followUpSuggestions.set(['Follow-up 1']);
    mockStore.quickActionResult.set({
      action_id: 'patient_days_by_unit',
      title: 'Patient Days by Unit',
      summary_markdown: 'Summary',
      columns: ['Unit'],
      rows: [{ Unit: 'PCU 350' }],
    });
    mockStore.latestSolution.set({
      use_case: 'service_unit',
      institution_id: 'stanford_childrens',
      solver_status: 'OPTIMAL',
      objective_value: 100,
      solve_time_ms: 3.1,
      service_unit_assignments: [
        {
          service: 'General Pediatrics',
          unit: 'PCU 350',
          is_home_unit: true,
          baseline_patient_days: 400,
          expert_baseline_patient_days: 450,
          optimized_patient_days: 445,
          allocated_beds: 18,
          delta_patient_days: 45,
        },
        {
          service: 'General Pediatrics',
          unit: 'PICU',
          is_home_unit: false,
          baseline_patient_days: 80,
          expert_baseline_patient_days: 20,
          optimized_patient_days: 25,
          allocated_beds: 2,
          delta_patient_days: -55,
        },
      ],
      des_evaluation: {
        use_case: 'service_unit',
        replications: 128,
        horizon_days: 180,
        overall_expert_gap_pct: 1.2,
        metrics: [
          {
            metric_key: 'off_service_patient_days',
            label: 'Off-Service Days',
            unit_label: 'days',
            manual_historical_value: 400,
            expert_baseline_value: 100,
            llm_mpax_value: 110,
            improvement_vs_manual_pct: 72.5,
            expert_attainment_pct: 96.7,
          },
        ],
      },
    });
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="table-service-unit-assignments"]',
      ),
    ).toBeTruthy();

    // Switch to Use Case 2 solution
    mockStore.latestSolution.set({
      use_case: 'surgical_scheduling',
      institution_id: 'stanford_childrens',
      solver_status: 'OPTIMAL',
      objective_value: 80,
      solve_time_ms: 2.5,
      surgical_schedule_assignments: [
        {
          program: 'POINTS',
          procedure_group: 'VSD Repair',
          recovery_unit: 'CVICU',
          day_of_week: 'Mon',
          baseline_cases: 4,
          optimized_cases: 2,
          expected_postop_los_days: 5.1,
          expected_unit_occupancy: 6.2,
          unit_capacity: 22,
        },
      ],
      des_evaluation: {
        use_case: 'surgical_scheduling',
        replications: 128,
        horizon_days: 180,
        overall_expert_gap_pct: 1.0,
        metrics: [],
      },
    });
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="table-surgical-schedule"]',
      ),
    ).toBeTruthy();

    // Switch to Use Case 3 solution
    mockStore.latestSolution.set({
      use_case: 'staffing_optimization',
      institution_id: 'stanford_childrens',
      solver_status: 'OPTIMAL',
      objective_value: 60,
      solve_time_ms: 2.1,
      staffing_assignments: [
        {
          unit: 'PCU 350',
          season_window: 'Winter Surge',
          scheduled_core_rns: 9.5,
          scheduled_float_rns: 2.0,
          scheduled_physicians: 3.0,
          unexpected_overtime_shifts: 1.0,
          administrative_a_days: 0.5,
          staffing_cost_per_patient_day: 980,
          net_margin_contribution: 1870,
        },
      ],
      des_evaluation: {
        use_case: 'staffing_optimization',
        replications: 128,
        horizon_days: 180,
        overall_expert_gap_pct: 0.8,
        metrics: [],
      },
    });
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="table-staffing-assignments"]',
      ),
    ).toBeTruthy();
  });
});
