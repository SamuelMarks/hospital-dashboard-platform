import { safeStorage } from '../../../core/storage.utils';
/** @docs */
/**
 * @fileoverview Onboarding Service.
 * Manages the onboarding wizard state and completion tracking.
 * Persists completion status to safeStorage so the wizard only shows once.
 */

import { Injectable, inject, PLATFORM_ID, signal, computed, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Storage key for onboarding completion flag. */
const STORAGE_KEY = 'pulse_onboarding_complete';

/** Storage key for tracking which steps have been seen. */
const STEPS_KEY = 'pulse_onboarding_steps_seen';

/**
 * Onboarding step definition.
 */
export interface OnboardingStep {
  /** Unique step identifier. */
  id: string;
  /** Step title. */
  title: string;
  /** Step description. */
  description: string;
  /** Material icon name for the step. */
  icon: string;
  /** Optional action label for a CTA button. */
  actionLabel?: string;
  /** Optional route to navigate to when action is triggered. */
  actionRoute?: string;
}

/** All onboarding steps in order. */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Pulse Query',
    description:
      'Your hospital analytics platform for real-time operational insights, capacity planning, and AI-assisted data exploration.',
    icon: 'local_hospital',
  },
  {
    id: 'dashboards',
    title: 'Dynamic Dashboards',
    description:
      'Build responsive dashboards with drag-and-drop widgets. Each widget can display SQL query results, charts, metrics, or external data.',
    icon: 'dashboard',
    actionLabel: 'Create Dashboard',
    actionRoute: '/',
  },
  {
    id: 'ai-assistant',
    title: 'AI Assistant',
    description:
      'Ask questions in plain English and let the AI generate SQL queries for you. Compare multiple model outputs and select the best one.',
    icon: 'smart_toy',
    actionLabel: 'Try Ask AI',
    actionRoute: '/chat',
  },
  {
    id: 'simulation',
    title: 'Simulation & Optimization',
    description:
      'Run what-if scenarios to optimize bed allocation, staffing levels, and resource distribution using mathematical solvers.',
    icon: 'science',
    actionLabel: 'Open Simulation',
    actionRoute: '/simulation',
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    description:
      'Power users can navigate quickly with keyboard shortcuts. Press ? at any time to see all available shortcuts.',
    icon: 'keyboard',
  },
];

/**
 * Onboarding Service.
 *
 * Controls the onboarding wizard lifecycle:
 * - Shows the wizard to new users on first visit
 * - Tracks which steps have been completed
 * - Persists completion state across sessions
 */
@Injectable({
  providedIn: 'root',
})
export class OnboardingService {
  /** Injected PLATFORM_ID. */ private readonly platformId = inject(PLATFORM_ID);

  /** Is visible. */ private readonly _isVisible = signal(false);
  /** Current step index. */ private readonly _currentStepIndex = signal(0);
  /** Is complete signal. */ private readonly _isComplete = signal(false);

  /**
   * Whether the onboarding wizard is currently visible.
   */
  readonly isVisible: Signal<boolean> = this._isVisible.asReadonly();

  /**
   * The index of the currently displayed step.
   */
  readonly currentStepIndex: Signal<number> = this._currentStepIndex.asReadonly();

  /**
   * Whether onboarding has been completed.
   */
  readonly isComplete: Signal<boolean> = this._isComplete.asReadonly();

  /**
   * The current step object.
   */
  readonly currentStep: Signal<OnboardingStep> = computed(
    () => ONBOARDING_STEPS[this._currentStepIndex()],
  );

  /**
   * Total number of onboarding steps.
   */
  readonly totalSteps: Signal<number> = computed(() => ONBOARDING_STEPS.length);

  /**
   * Whether there is a next step.
   */
  readonly hasNext: Signal<boolean> = computed(
    () => this._currentStepIndex() < ONBOARDING_STEPS.length - 1,
  );

  /**
   * Whether there is a previous step.
   */
  readonly hasPrev: Signal<boolean> = computed(() => this._currentStepIndex() > 0);

  /**
   * Progress percentage (0-100).
   */
  readonly progress: Signal<number> = computed(() =>
    Math.round(((this._currentStepIndex() + 1) / ONBOARDING_STEPS.length) * 100),
  );

  /** Constructor. */ constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.checkAndShowOnboarding();
    }
  }

  /**
   * Starts the onboarding wizard from the beginning.
   */
  start(): void {
    this._currentStepIndex.set(0);
    this._isVisible.set(true);
  }

  /**
   * Advances to the next step.
   */
  next(): void {
    if (this.hasNext()) {
      this._currentStepIndex.update((i) => i + 1);
    } else {
      this.complete();
    }
  }

  /**
   * Goes back to the previous step.
   */
  prev(): void {
    if (this.hasPrev()) {
      this._currentStepIndex.update((i) => i - 1);
    }
  }

  /**
   * Jumps to a specific step by index.
   *
   * @param index - Zero-based step index.
   */
  goToStep(index: number): void {
    if (index >= 0 && index < ONBOARDING_STEPS.length) {
      this._currentStepIndex.set(index);
    }
  }

  /**
   * Marks onboarding as complete and hides the wizard.
   */
  complete(): void {
    this._isComplete.set(true);
    this._isVisible.set(false);

    if (isPlatformBrowser(this.platformId)) {
      safeStorage.setItem(STORAGE_KEY, 'true');
    }
  }

  /**
   * Skips onboarding without marking individual steps as complete.
   */
  skip(): void {
    this.complete();
  }

  /**
   * Resets onboarding state (for testing or re-triggering).
   */
  reset(): void {
    this._isComplete.set(false);
    this._currentStepIndex.set(0);
    this._isVisible.set(false);

    if (isPlatformBrowser(this.platformId)) {
      safeStorage.removeItem(STORAGE_KEY);
      safeStorage.removeItem(STEPS_KEY);
    }
  }

  /**
   * Checks whether onboarding should be shown and triggers it if needed.
   */
  private checkAndShowOnboarding(): void {
    const isComplete = safeStorage.getItem(STORAGE_KEY) === 'true';

    if (!isComplete) {
      // Small delay to let the app fully render before showing the wizard
      setTimeout(() => this._isVisible.set(true), 500);
    } else {
      this._isComplete.set(true);
    }
  }
}
