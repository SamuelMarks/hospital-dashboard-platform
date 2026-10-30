/**
 * @fileoverview Signal-based state store for the LLM + JAX + MPAX Hospital Operations
 * Optimization Workspace (`OptimizationStore`).
 *
 * Orchestrates:
 * - Partner hospital institution profiles (`stanford_childrens`, `chop`, `mgh`, etc.)
 * - Model compendium selection (`gemini-2.5-pro`, `medgemma-27b-text-it`, `vaultgemma-9b`, `litert-medgemma-4b-int4`, etc.)
 * - One-click Quick Action executions (`patient_days_by_unit`, `patient_days_by_service`, `combined_analysis`, `summary_statistics`, etc.)
 * - Iterative conversational optimization sessions across Use Case 1 (`service_unit`),
 *   Use Case 2 (`surgical_scheduling`), and Use Case 3 (`staffing_optimization`)
 * - Qualitative & quantitative User Experience Survey submissions (Metric 2 of Technical Addendum)
 */

import { computed, inject, linkedSignal, Service, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import {
  InstitutionProfileSchema,
  ModelCompendiumEntrySchema,
  OptimizationEvaluationSummaryResponse,
  OptimizationIterationResponse,
  OptimizationService,
  OptimizationSessionResponse,
  OptimizationSolutionPayload,
  OptimizationSurveyCreate,
  QuickActionDefinitionSchema,
  QuickActionExecutionResponse,
} from '../api-client';
import { extractApiErrorMessage } from '../core/error.utils';

/** Clinical optimization use case union type. */
export type OptimizationUseCase = OptimizationSolutionPayload.UseCaseEnum;

/** One-click Quick Action identifier union type. */
export type QuickActionType = QuickActionDefinitionSchema.ActionIdEnum;

/**
 * Signal-based singleton store managing state for the Hospital Optimization Copilot & Workspace.
 */
@Service()
export class OptimizationStore {
  /** Generated OpenAPI optimization service client. */
  private readonly api = inject(OptimizationService);

  /** Partner hospital institution profiles loaded from `/api/v1/optimization/institutions`. */
  readonly institutions = signal<InstitutionProfileSchema[]>([]);
  /** Model compendium entries loaded from `/api/v1/optimization/models`. */
  readonly models = signal<ModelCompendiumEntrySchema[]>([]);
  /** Quick Action button definitions loaded from `/api/v1/optimization/quick-actions`. */
  readonly quickActions = signal<QuickActionDefinitionSchema[]>([]);

  /** Currently selected clinical optimization use case. */
  readonly selectedUseCase = signal<OptimizationUseCase>('service_unit');
  /** Currently selected partner hospital institution ID. */
  readonly selectedInstitutionId = signal<string>('stanford_childrens');
  /** Currently selected LLM or LiteRT on-device model ID. */
  readonly selectedModelId = signal<string>('gemini-2.5-pro');

  /** Active conversational optimization session, if created. */
  readonly activeSession = signal<OptimizationSessionResponse | null>(null);
  /** Latest solved JAX/MPAX optimization payload. */
  readonly latestSolution = signal<OptimizationSolutionPayload | null>(null);
  /** Latest Quick Action tabular report response. */
  readonly quickActionResult = signal<QuickActionExecutionResponse | null>(null);
  /** Aggregated quantitative (DES) and qualitative (Survey) evaluation summary. */
  readonly evaluationSummary = signal<OptimizationEvaluationSummaryResponse | null>(null);

  /** Whether metadata or solver execution is currently in progress. */
  readonly isLoading = signal<boolean>(false);
  /** Whether a qualitative user experience survey submission is in progress. */
  readonly isSubmittingSurvey = signal<boolean>(false);
  /** Active error banner message, or null when healthy. */
  readonly error = signal<string | null>(null);
  /** Confirmation banner shown after submitting the UX evaluation survey. */
  readonly surveySuccessMessage = signal<string | null>(null);

  /** Linked signal tracking the active institution profile object for the selected institution ID. */
  readonly activeInstitution = linkedSignal<InstitutionProfileSchema | null>(() => {
    const id = this.selectedInstitutionId();
    return this.institutions().find((inst) => inst.institution_id === id) ?? null;
  });

  /** Computed list of Quick Actions filtered for the currently selected use case. */
  readonly visibleQuickActions = computed<QuickActionDefinitionSchema[]>(() => {
    const uc = this.selectedUseCase();
    const coreIds = new Set<string>([
      'patient_days_by_unit',
      'patient_days_by_service',
      'combined_analysis',
      'summary_statistics',
    ]);
    return this.quickActions().filter((qa) => qa.use_case === uc || coreIds.has(qa.action_id));
  });

  /** Computed chronological list of conversational iterations in the active session. */
  readonly iterations = computed<OptimizationIterationResponse[]>(
    () => this.activeSession()?.iterations ?? [],
  );

  /** Computed latest assistant clinical explanation markdown. */
  readonly latestExplanation = computed<string | null>(() => {
    const last = this.iterations().at(-1);
    return last ? last.assistant_explanation : null;
  });

  /** Computed follow-up prompt suggestions from the most recent iteration. */
  readonly followUpSuggestions = computed<string[]>(() => {
    const last = this.iterations().at(-1);
    return last ? (last.follow_up_suggestions ?? []) : [];
  });

  /**
   * Loads institutions, model compendium, Quick Actions, and baseline solution on initialization.
   *
   * @param initialPrompt Optional prompt passed via route query params (e.g., from Benchmarks).
   * @param initialUseCase Optional use case passed via route query params.
   */
  initializeWorkspace(
    initialPrompt?: string | null,
    initialUseCase?: OptimizationUseCase | null,
  ): void {
    if (initialUseCase) {
      this.selectedUseCase.set(initialUseCase);
    }
    this.isLoading.set(true);
    this.error.set(null);

    forkJoin({
      institutions: this.api.getOptimizationInstitutionsApiV1OptimizationInstitutionsGet(),
      models: this.api.getOptimizationModelCompendiumApiV1OptimizationModelsGet(),
      quickActions: this.api.getOptimizationQuickActionsApiV1OptimizationQuickActionsGet(),
      summary: this.api.getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet(),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ institutions, models, quickActions, summary }) => {
          this.institutions.set(institutions);
          this.models.set(models);
          this.quickActions.set(quickActions);
          this.evaluationSummary.set(summary);

          if (initialPrompt && initialPrompt.trim()) {
            this.submitPrompt(initialPrompt.trim());
          } else {
            this.runStatelessSolve();
          }
        },
        error: (err: unknown) => {
          this.error.set(
            extractApiErrorMessage(err, $localize`Failed to initialize Optimization Workspace.`),
          );
        },
      });
  }

  /**
   * Updates the active clinical optimization use case and solves its baseline model.
   *
   * @param useCase Target clinical use case (`service_unit`, `surgical_scheduling`, `staffing_optimization`).
   */
  selectUseCase(useCase: OptimizationUseCase): void {
    this.selectedUseCase.set(useCase);
    this.activeSession.set(null);
    this.quickActionResult.set(null);
    this.runStatelessSolve();
  }

  /**
   * Updates the active partner hospital institution profile and refreshes the optimization baseline.
   *
   * @param institutionId Target partner institution identifier.
   */
  selectInstitution(institutionId: string): void {
    this.selectedInstitutionId.set(institutionId);
    this.activeSession.set(null);
    this.quickActionResult.set(null);
    this.runStatelessSolve();
  }

  /**
   * Updates the active LLM or LiteRT on-device model identifier.
   *
   * @param modelId Target model identifier.
   */
  selectModel(modelId: string): void {
    this.selectedModelId.set(modelId);
  }

  /**
   * Executes a stateless JAX/MPAX optimization solve for the active use case and institution.
   *
   * @param prompt Optional natural-language prompt to apply.
   */
  runStatelessSolve(prompt?: string): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.api
      .solveOptimizationStatelessApiV1OptimizationSolvePost({
        use_case: this.selectedUseCase(),
        institution_id: this.selectedInstitutionId(),
        model_id: this.selectedModelId(),
        prompt: prompt ?? null,
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (sol: OptimizationSolutionPayload) => {
          this.latestSolution.set(sol);
        },
        error: (err: unknown) => {
          this.error.set(extractApiErrorMessage(err, $localize`Optimization solver failed.`));
        },
      });
  }

  /**
   * Executes one of the Quick Action buttons (`patient_days_by_unit`, `patient_days_by_service`,
   * `combined_analysis`, `summary_statistics`, `optimize_service_units`, `smooth_surgical_schedule`,
   * or `optimize_nurse_staffing`).
   *
   * @param actionId Quick Action identifier to execute.
   */
  executeQuickAction(actionId: QuickActionType): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.api
      .executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost(actionId, {
        institution_id: this.selectedInstitutionId(),
        use_case: this.selectedUseCase(),
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res: QuickActionExecutionResponse) => {
          this.quickActionResult.set(res);
          if (res.optimization_solution) {
            this.latestSolution.set(res.optimization_solution);
          }
        },
        error: (err: unknown) => {
          this.error.set(extractApiErrorMessage(err, $localize`Quick Action execution failed.`));
        },
      });
  }

  /**
   * Submits a conversational natural-language optimization prompt.
   * Creates a new `OptimizationSession` if none exists yet, or appends an iteration turn to the active session.
   *
   * @param prompt Natural language instruction from the hospital decision maker.
   */
  submitPrompt(prompt: string): void {
    const cleaned = prompt.trim();
    if (!cleaned) return;

    this.isLoading.set(true);
    this.error.set(null);
    const currentSession = this.activeSession();

    if (!currentSession) {
      this.api
        .createOptimizationSessionApiV1OptimizationSessionsPost({
          use_case: this.selectedUseCase(),
          institution_id: this.selectedInstitutionId(),
          initial_prompt: cleaned,
          model_id: this.selectedModelId(),
        })
        .pipe(finalize(() => this.isLoading.set(false)))
        .subscribe({
          next: (session: OptimizationSessionResponse) => {
            this.activeSession.set(session);
            if (session.latest_solution) {
              this.latestSolution.set(session.latest_solution);
            }
          },
          error: (err: unknown) => {
            this.error.set(
              extractApiErrorMessage(err, $localize`Failed to start optimization session.`),
            );
          },
        });
      return;
    }

    this.api
      .iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost(currentSession.id, {
        prompt: cleaned,
        model_id: this.selectedModelId(),
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (turn: OptimizationIterationResponse) => {
          this.latestSolution.set(turn.solution);
          this.activeSession.update((sess) =>
            sess
              ? {
                  ...sess,
                  latest_solution: turn.solution,
                  iterations: [...(sess.iterations ?? []), turn],
                }
              : null,
          );
        },
        error: (err: unknown) => {
          this.error.set(extractApiErrorMessage(err, $localize`Optimization iteration failed.`));
        },
      });
  }

  /**
   * Submits the qualitative & quantitative User Experience Survey (Metric 2 of Technical Addendum).
   *
   * @param payload Survey scores and qualitative feedback.
   */
  submitSurvey(payload: OptimizationSurveyCreate): void {
    this.isSubmittingSurvey.set(true);
    this.error.set(null);
    this.surveySuccessMessage.set(null);

    const requestPayload: OptimizationSurveyCreate = {
      ...payload,
      session_id: this.activeSession()?.id ?? null,
      use_case: this.selectedUseCase(),
    };

    this.api
      .submitOptimizationSurveyApiV1OptimizationSurveysPost(requestPayload)
      .pipe(finalize(() => this.isSubmittingSurvey.set(false)))
      .subscribe({
        next: () => {
          this.surveySuccessMessage.set(
            $localize`Thank you! Your clinical workflow evaluation has been recorded.`,
          );
          this.api
            .getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet()
            .subscribe((summary) => this.evaluationSummary.set(summary));
        },
        error: (err: unknown) => {
          this.error.set(extractApiErrorMessage(err, $localize`Failed to submit user survey.`));
        },
      });
  }
}
