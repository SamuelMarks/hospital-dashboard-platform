/**
 * @fileoverview Unit tests for `OptimizationStore` achieving 100% statement, branch, function, and line coverage.
 */

import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';

import {
  InstitutionProfileSchema,
  ModelCompendiumEntrySchema,
  OptimizationEvaluationSummaryResponse,
  OptimizationIterationResponse,
  OptimizationService,
  OptimizationSessionResponse,
  OptimizationSolutionPayload,
  QuickActionDefinitionSchema,
  QuickActionExecutionResponse,
} from '../api-client';
import { OptimizationStore } from './optimization.store';

const MOCK_INSTITUTIONS: InstitutionProfileSchema[] = [
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
    federated_node_enabled: true,
  },
];

const MOCK_MODELS: ModelCompendiumEntrySchema[] = [
  {
    model_id: 'gemini-2.5-pro',
    display_name: 'Gemini 2.5 Pro',
    family: 'gemini',
    deployment_target: 'gcp_cloud',
    supports_differential_privacy: false,
    supports_hot_loading: false,
  },
];

const MOCK_QUICK_ACTIONS: QuickActionDefinitionSchema[] = [
  {
    action_id: 'patient_days_by_unit',
    label: 'Patient Days by Unit',
    icon: '📊',
    description: 'Unit census',
    use_case: 'service_unit',
    default_prompt: 'Show patient days by unit',
  },
  {
    action_id: 'smooth_surgical_schedule',
    label: 'Smooth Surgical Schedule',
    icon: '🩺',
    description: 'Smooth surgery',
    use_case: 'surgical_scheduling',
    default_prompt: 'Smooth surgical schedule',
  },
];

const MOCK_SOLUTION: OptimizationSolutionPayload = {
  use_case: 'service_unit',
  institution_id: 'stanford_childrens',
  solver_status: 'OPTIMAL',
  objective_value: 100,
  solve_time_ms: 4.2,
  service_unit_assignments: [
    {
      service: 'General Pediatrics',
      unit: 'PCU 350',
      is_home_unit: true,
      baseline_patient_days: 500,
      expert_baseline_patient_days: 580,
      optimized_patient_days: 575,
      allocated_beds: 20,
      delta_patient_days: 75,
    },
  ],
  surgical_schedule_assignments: [],
  staffing_assignments: [],
  des_evaluation: {
    use_case: 'service_unit',
    replications: 128,
    horizon_days: 180,
    overall_expert_gap_pct: 1.5,
    metrics: [
      {
        metric_key: 'off_service_patient_days',
        label: 'Off-Service Patient Days',
        unit_label: 'patient-days',
        lower_is_better: true,
        manual_historical_value: 420,
        expert_baseline_value: 95,
        llm_mpax_value: 102,
        improvement_vs_manual_pct: 75.7,
        expert_attainment_pct: 97.8,
      },
    ],
  },
};

const MOCK_SUMMARY: OptimizationEvaluationSummaryResponse = {
  total_sessions: 3,
  total_iterations: 6,
  mean_expert_baseline_gap_pct: 1.5,
  survey_count: 2,
  mean_score_vs_manual_process: 4.8,
  mean_score_vs_other_workflow_tech: 4.7,
  mean_interpretability_score: 4.9,
  recent_surveys: [],
};

describe('OptimizationStore', () => {
  let store: OptimizationStore;
  let mockApi: {
    getOptimizationInstitutionsApiV1OptimizationInstitutionsGet: ReturnType<typeof vi.fn>;
    getOptimizationModelCompendiumApiV1OptimizationModelsGet: ReturnType<typeof vi.fn>;
    getOptimizationQuickActionsApiV1OptimizationQuickActionsGet: ReturnType<typeof vi.fn>;
    getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet: ReturnType<typeof vi.fn>;
    solveOptimizationStatelessApiV1OptimizationSolvePost: ReturnType<typeof vi.fn>;
    executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost: ReturnType<
      typeof vi.fn
    >;
    createOptimizationSessionApiV1OptimizationSessionsPost: ReturnType<typeof vi.fn>;
    iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost: ReturnType<
      typeof vi.fn
    >;
    submitOptimizationSurveyApiV1OptimizationSurveysPost: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockApi = {
      getOptimizationInstitutionsApiV1OptimizationInstitutionsGet: vi
        .fn()
        .mockReturnValue(of(MOCK_INSTITUTIONS)),
      getOptimizationModelCompendiumApiV1OptimizationModelsGet: vi
        .fn()
        .mockReturnValue(of(MOCK_MODELS)),
      getOptimizationQuickActionsApiV1OptimizationQuickActionsGet: vi
        .fn()
        .mockReturnValue(of(MOCK_QUICK_ACTIONS)),
      getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet: vi
        .fn()
        .mockReturnValue(of(MOCK_SUMMARY)),
      solveOptimizationStatelessApiV1OptimizationSolvePost: vi
        .fn()
        .mockReturnValue(of(MOCK_SOLUTION)),
      executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost: vi.fn(),
      createOptimizationSessionApiV1OptimizationSessionsPost: vi.fn(),
      iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost: vi.fn(),
      submitOptimizationSurveyApiV1OptimizationSurveysPost: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [OptimizationStore, { provide: OptimizationService, useValue: mockApi }],
    });
    store = TestBed.inject(OptimizationStore);
  });

  it('should initialize workspace without initial prompt and compute activeInstitution and visibleQuickActions', () => {
    expect(store.activeInstitution()).toBeNull();
    expect(store.latestExplanation()).toBeNull();
    expect(store.followUpSuggestions()).toEqual([]);

    store.initializeWorkspace(null, 'surgical_scheduling');

    expect(store.selectedUseCase()).toBe('surgical_scheduling');
    expect(store.institutions()).toEqual(MOCK_INSTITUTIONS);
    expect(store.activeInstitution()?.institution_id).toBe('stanford_childrens');
    expect(store.visibleQuickActions().length).toBe(2);
    expect(store.latestSolution()).toEqual(MOCK_SOLUTION);
    expect(mockApi.solveOptimizationStatelessApiV1OptimizationSolvePost).toHaveBeenCalled();
  });

  it('should initialize workspace with initialPrompt and create a session', () => {
    const mockSession: OptimizationSessionResponse = {
      id: 'sess-1',
      user_id: 'u-1',
      use_case: 'service_unit',
      institution_id: 'stanford_childrens',
      title: 'Test Session',
      latest_solution: MOCK_SOLUTION,
      iterations: [
        {
          id: 'it-1',
          session_id: 'sess-1',
          turn_index: 1,
          user_prompt: 'Open 10 beds',
          model_id: 'gemini-2.5-pro',
          assistant_explanation: 'Opened 10 beds',
          follow_up_suggestions: ['Next suggestion'],
          solution: MOCK_SOLUTION,
          latency_ms: 12,
          created_at: '2026-10-30T00:00:00Z',
        },
      ],
      created_at: '2026-10-30T00:00:00Z',
      updated_at: '2026-10-30T00:00:00Z',
    };
    mockApi.createOptimizationSessionApiV1OptimizationSessionsPost.mockReturnValue(of(mockSession));

    store.initializeWorkspace('  Open 10 beds  ', null);

    expect(store.activeSession()?.id).toBe('sess-1');
    expect(store.latestExplanation()).toBe('Opened 10 beds');
    expect(store.followUpSuggestions()).toEqual(['Next suggestion']);
  });

  it('should handle initialization and stateless solve errors', () => {
    mockApi.getOptimizationInstitutionsApiV1OptimizationInstitutionsGet.mockReturnValue(
      throwError(() => new Error('Init failed')),
    );
    store.initializeWorkspace();
    expect(store.error()).toBe('Init failed');

    mockApi.solveOptimizationStatelessApiV1OptimizationSolvePost.mockReturnValue(
      throwError(() => new Error('Solver error')),
    );
    store.runStatelessSolve('prompt');
    expect(store.error()).toBe('Solver error');
  });

  it('should select useCase, institution, and model', () => {
    store.selectUseCase('staffing_optimization');
    expect(store.selectedUseCase()).toBe('staffing_optimization');

    store.selectInstitution('chop');
    expect(store.selectedInstitutionId()).toBe('chop');

    store.selectModel('medgemma-27b-text-it');
    expect(store.selectedModelId()).toBe('medgemma-27b-text-it');
  });

  it('should execute quick actions with and without optimization_solution and handle errors', () => {
    const qaWithoutSol: QuickActionExecutionResponse = {
      action_id: 'patient_days_by_unit',
      title: 'By Unit',
      summary_markdown: 'Summary',
      columns: ['Unit'],
      rows: [{ Unit: 'PCU 350' }],
      optimization_solution: null,
    };
    mockApi.executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost.mockReturnValue(
      of(qaWithoutSol),
    );
    store.executeQuickAction('patient_days_by_unit');
    expect(store.quickActionResult()).toEqual(qaWithoutSol);

    const qaWithSol: QuickActionExecutionResponse = {
      ...qaWithoutSol,
      action_id: 'optimize_service_units',
      optimization_solution: MOCK_SOLUTION,
    };
    mockApi.executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost.mockReturnValue(
      of(qaWithSol),
    );
    store.executeQuickAction('optimize_service_units');
    expect(store.latestSolution()).toEqual(MOCK_SOLUTION);

    mockApi.executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost.mockReturnValue(
      throwError(() => new Error('QA failed')),
    );
    store.executeQuickAction('patient_days_by_unit');
    expect(store.error()).toBe('QA failed');
  });

  it('should handle submitPrompt session creation, iteration, empty prompt, and errors', () => {
    store.submitPrompt('   ');
    expect(mockApi.createOptimizationSessionApiV1OptimizationSessionsPost).not.toHaveBeenCalled();

    // Session without latest_solution and iteration without follow_up_suggestions
    const sessionNoSol: OptimizationSessionResponse = {
      id: 'sess-2',
      user_id: 'u-1',
      use_case: 'service_unit',
      institution_id: 'stanford_childrens',
      title: 'No Sol',
      latest_solution: null,
      iterations: undefined,
      created_at: '2026-10-30T00:00:00Z',
      updated_at: '2026-10-30T00:00:00Z',
    };
    mockApi.createOptimizationSessionApiV1OptimizationSessionsPost.mockReturnValue(
      of(sessionNoSol),
    );
    store.submitPrompt('First turn');
    expect(store.activeSession()?.id).toBe('sess-2');
    expect(store.iterations()).toEqual([]);

    const turnResp: OptimizationIterationResponse = {
      id: 'it-2',
      session_id: 'sess-2',
      turn_index: 2,
      user_prompt: 'Second turn',
      model_id: 'gemini-2.5-pro',
      assistant_explanation: 'Done',
      follow_up_suggestions: undefined,
      solution: MOCK_SOLUTION,
      latency_ms: 8,
      created_at: '2026-10-30T00:00:00Z',
    };
    mockApi.iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost.mockReturnValue(
      of(turnResp),
    );
    store.submitPrompt('Second turn');
    expect(store.iterations().length).toBe(1);
    expect(store.followUpSuggestions()).toEqual([]);

    // Error on iterate
    mockApi.iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost.mockReturnValue(
      throwError(() => new Error('Iterate failed')),
    );
    store.submitPrompt('Third turn');
    expect(store.error()).toBe('Iterate failed');

    // Error on create session
    store.activeSession.set(null);
    mockApi.createOptimizationSessionApiV1OptimizationSessionsPost.mockReturnValue(
      throwError(() => new Error('Create failed')),
    );
    store.submitPrompt('Create fail');
    expect(store.error()).toBe('Create failed');
  });

  it('should handle activeSession becoming null before iterate callback completes', () => {
    const sess: OptimizationSessionResponse = {
      id: 'sess-3',
      user_id: 'u-1',
      use_case: 'service_unit',
      institution_id: 'stanford_childrens',
      title: 'S3',
      latest_solution: MOCK_SOLUTION,
      iterations: [],
      created_at: '2026-10-30T00:00:00Z',
      updated_at: '2026-10-30T00:00:00Z',
    };
    store.activeSession.set(sess);
    const turnResp: OptimizationIterationResponse = {
      id: 'it-3',
      session_id: 'sess-3',
      turn_index: 1,
      user_prompt: 'Turn',
      model_id: 'gemini-2.5-pro',
      assistant_explanation: 'Expl',
      follow_up_suggestions: ['S1'],
      solution: MOCK_SOLUTION,
      latency_ms: 5,
      created_at: '2026-10-30T00:00:00Z',
    };
    mockApi.iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost.mockImplementation(
      () => {
        store.activeSession.set(null);
        return of(turnResp);
      },
    );
    store.submitPrompt('Turn');
    expect(store.activeSession()).toBeNull();
  });

  it('should submit survey and handle survey errors', () => {
    mockApi.submitOptimizationSurveyApiV1OptimizationSurveysPost.mockReturnValue(
      of({ id: 'surv-1' }),
    );
    store.submitSurvey({
      score_vs_manual_process: 5,
      score_vs_other_workflow_tech: 5,
      interpretability_score: 5,
      qualitative_feedback: 'Great!',
    });
    expect(store.surveySuccessMessage()).toContain('Thank you!');

    mockApi.submitOptimizationSurveyApiV1OptimizationSurveysPost.mockReturnValue(
      throwError(() => new Error('Survey error')),
    );
    store.submitSurvey({
      score_vs_manual_process: 4,
      score_vs_other_workflow_tech: 4,
      interpretability_score: 4,
    });
    expect(store.error()).toBe('Survey error');
  });
});
