/**
 * @fileoverview Hospital Operations Optimization Copilot & Self-Service Workspace (`OptimizationComponent`).
 *
 * Implements the self-service conversational and Quick-Action interface from
 * `MPAX_PROJECT_PLAN.md` and `[Technical_addendum]_MPAX_PROJECT_PLAN.md` (including the
 * Stanford Medicine Children's Health alpha Bed-Use Tool design):
 * 1. "What I Can Do" capabilities overview + "Quick Actions" one-click buttons:
 *    - 📊 Patient Days by Unit
 *    - 🏥 Patient Days by Service
 *    - 📈 Combined Analysis
 *    - 📋 Summary Statistics
 *    - 🛏️ Optimize Service-Unit Assignments (Use Case 1)
 *    - 🩺 Smooth Surgical Schedule — BEDS & POINTS (Use Case 2)
 *    - 👩‍⚕️ Optimize Nurse & Physician Staffing (Use Case 3)
 * 2. Multi-Institutional Partner Selector & Model Compendium Selector (Gemini 2.5 Pro,
 *    MedGemma 27B, VaultGemma 9B, Gemma 4 26B, DeepSeek R1, Llama 3.3 70B, LiteRT On-Device).
 * 3. Iterative Natural-Language Optimization Copilot + Quantitative JAX DES Expert Baseline
 *    Comparison Cards + Qualitative User Experience Survey.
 */

import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormField, FormRoot, form, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';

import { extractEventInputValue } from '../shared/utils/dom-event.utils';
import { OptimizationStore, OptimizationUseCase, QuickActionType } from './optimization.store';

/**
 * Self-service Hospital Operations Optimization Copilot & Workspace component.
 */
@Component({
  selector: 'app-optimization',
  imports: [
    FormRoot,
    FormField,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTabsModule,
  ],
  templateUrl: './optimization.component.html',
  styleUrl: './optimization.component.scss',
})
export class OptimizationComponent implements OnInit {
  /** Injected signal-based optimization workspace store. */
  readonly store = inject(OptimizationStore);
  /** Injected activated route for reading optional `prompt` or `useCase` query params. */
  private readonly route = inject(ActivatedRoute);

  /** Underlying reactive signal model for the conversational optimization prompt form. */
  readonly promptModel = signal({
    prompt:
      'Place all General Pediatrics patients on PCU 350 and assume we open PCU 360 with 10 additional beds.',
  });

  /** Signal Form binding and schema validation for the conversational prompt input. */
  readonly promptForm = form(this.promptModel, (s) => {
    required(s.prompt, { message: $localize`Prompt is required` });
  });

  /** Whether the qualitative User Experience Survey drawer/card is expanded. */
  readonly showSurveyPanel = signal<boolean>(false);
  /** Selected clinical role category in the qualitative UX survey. */
  readonly surveyRole = signal<string>('Physician');
  /** 1-5 rating comparing against the manual graduate-student email loop. */
  readonly surveyScoreManual = signal<number>(5);
  /** 1-5 rating comparing against other hospital workflow technology (EHR/spreadsheets). */
  readonly surveyScoreTech = signal<number>(5);
  /** 1-5 rating of result transparency and clinical interpretability. */
  readonly surveyScoreInterpretability = signal<number>(5);
  /** Open-ended qualitative feedback comment in the UX survey. */
  readonly surveyFeedback = signal<string>('');

  /**
   * Initializes the workspace and reads optional `prompt` and `useCase` route query parameters.
   */
  ngOnInit(): void {
    const queryPrompt = this.route.snapshot.queryParamMap.get('prompt');
    const queryUseCase = this.route.snapshot.queryParamMap.get(
      'useCase',
    ) as OptimizationUseCase | null;

    if (queryPrompt && queryPrompt.trim()) {
      this.promptModel.update((m) => ({ ...m, prompt: queryPrompt.trim() }));
    }
    this.store.initializeWorkspace(queryPrompt, queryUseCase);
  }

  /**
   * Extracts the string value from a native DOM input event.
   *
   * @param event Native DOM input event.
   * @returns Extracted string value.
   */
  getEventValue(event: Event): string {
    return extractEventInputValue(event);
  }

  /**
   * Switches the active clinical optimization use case.
   *
   * @param useCase Target clinical optimization use case.
   */
  onSelectUseCase(useCase: OptimizationUseCase): void {
    this.store.selectUseCase(useCase);
    const defaultPrompts: Record<OptimizationUseCase, string> = {
      service_unit:
        'Place all General Pediatrics patients on PCU 350 and assume we open PCU 360 with 10 additional beds.',
      surgical_scheduling:
        'Cap daily CVICU post-op admissions for POINTS cardiac procedures at 4 cases and reserve 4 emergency beds on PICU.',
      staffing_optimization:
        'Cap unexpected RN overtime shifts at 2 per week and expand cross-unit float pool capacity to 6 shifts.',
    };
    this.promptModel.set({ prompt: defaultPrompts[useCase] });
  }

  /**
   * Switches the active partner hospital institution profile.
   *
   * @param institutionId Target partner hospital institution ID.
   */
  onSelectInstitution(institutionId: string): void {
    this.store.selectInstitution(institutionId);
  }

  /**
   * Switches the active LLM or LiteRT on-device model.
   *
   * @param modelId Target model identifier.
   */
  onSelectModel(modelId: string): void {
    this.store.selectModel(modelId);
  }

  /**
   * Executes a one-click Quick Action button.
   *
   * @param actionId Quick Action identifier.
   */
  onExecuteQuickAction(actionId: QuickActionType): void {
    this.store.executeQuickAction(actionId);
  }

  /**
   * Populates the prompt bar with a suggested follow-up prompt and submits it to the copilot.
   *
   * @param suggestion Suggested natural-language refinement prompt.
   */
  onApplySuggestion(suggestion: string): void {
    this.promptModel.set({ prompt: suggestion });
    this.store.submitPrompt(suggestion);
  }

  /**
   * Submits the conversational optimization prompt form to the JAX/MPAX copilot.
   */
  onSubmitPrompt(): void {
    if (this.promptForm().invalid()) return;
    const text = this.promptModel().prompt.trim();
    this.store.submitPrompt(text);
  }

  /**
   * Toggles the visibility of the qualitative User Experience Survey card.
   */
  toggleSurveyPanel(): void {
    this.showSurveyPanel.update((v) => !v);
  }

  /**
   * Submits the structured qualitative & quantitative UX evaluation survey.
   */
  onSubmitSurvey(): void {
    this.store.submitSurvey({
      use_case: this.store.selectedUseCase(),
      role_category: this.surveyRole(),
      score_vs_manual_process: this.surveyScoreManual(),
      score_vs_other_workflow_tech: this.surveyScoreTech(),
      interpretability_score: this.surveyScoreInterpretability(),
      qualitative_feedback: this.surveyFeedback(),
    });
  }
}
