/**
 * @fileoverview Onboarding Wizard Component.
 * A multi-step wizard that introduces new users to Pulse Query's key features.
 * Displayed as an overlay dialog on first visit.
 */

import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OnboardingService, ONBOARDING_STEPS } from './onboarding.service';
import { FocusTrapDirective } from '../../../core/accessibility/focus-trap.directive';

/**
 * Onboarding Wizard Component.
 *
 * Displays a full-screen overlay guiding new users through the platform's
 * key features. Supports step navigation, skip, and completion.
 *
 * The wizard is shown automatically on first visit and can be re-triggered
 * via the `OnboardingService.start()` method.
 *
 * @example
 * ```html
 * <!-- Place in app root or shell component -->
 * @if (onboardingService.isVisible()) {
 *   <app-onboarding-wizard />
 * }
 * ```
 */
@Component({
  selector: 'app-onboarding-wizard',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    FocusTrapDirective,
  ],
  templateUrl: './onboarding-wizard.component.html',
  styles: [
    `
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 16px;
        backdrop-filter: blur(4px);
      }

      .wizard-card {
        background: var(--sys-surface);
        color: var(--sys-text-primary);
        border-radius: 16px;
        width: 100%;
        max-width: 520px;
        box-shadow:
          0 24px 48px rgba(0, 0, 0, 0.3),
          0 8px 16px rgba(0, 0, 0, 0.2);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .wizard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 16px 0 24px;
      }

      .step-counter {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--sys-text-secondary);
      }

      mat-progress-bar {
        margin-top: 8px;
      }

      .wizard-body {
        padding: 32px 32px 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 16px;
      }

      .step-icon {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: var(--sys-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .step-icon mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
        color: var(--sys-on-primary-container);
      }

      .step-title {
        margin: 0;
        font-size: 22px;
        font-weight: 500;
        color: var(--sys-text-primary);
      }

      .step-description {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        color: var(--sys-text-secondary);
        max-width: 400px;
      }

      .step-dots {
        display: flex;
        justify-content: center;
        gap: 4px;
        padding: 0 32px 8px;
      }

      .dot {
        width: 24px;
        height: 24px;
        padding: 8px;
        background-clip: content-box;
        border-radius: 50%;
        background-color: var(--sys-outline-variant);
        border: none;
        cursor: pointer;
        transition:
          background-color 0.2s,
          transform 0.2s;
      }

      .dot.active {
        background-color: var(--sys-primary);
        transform: scale(1.2);
      }

      .dot:focus-visible {
        outline: 2px solid var(--sys-primary);
        outline-offset: 2px;
      }

      .wizard-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px 24px;
        border-top: 1px solid var(--sys-surface-border);
      }

      .action-right {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      @media (max-width: 600px) {
        .wizard-card {
          max-width: 100%;
          border-radius: 12px;
        }

        .wizard-body {
          padding: 24px 20px 16px;
        }

        .wizard-actions {
          flex-direction: column;
          gap: 12px;
          align-items: stretch;
        }

        .action-right {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class OnboardingWizardComponent {
  /** State service managing onboarding wizard visibility and step progression. */
  readonly onboarding = inject(OnboardingService);
  /** Angular router service used to navigate to target feature routes during guided tours. */
  private readonly router = inject(Router);

  /**
   * All onboarding steps (for dot navigation).
   */
  readonly steps = ONBOARDING_STEPS;

  /**
   * Computed accessible label for the onboarding dialog overlay.
   */
  readonly dialogAriaLabel = computed(
    () =>
      $localize`Onboarding step ${this.onboarding.currentStepIndex() + 1} of ${this.onboarding.totalSteps()}`,
  );

  /**
   * Computed accessible label for the primary next/finish action button.
   */
  readonly nextButtonAriaLabel = computed(() =>
    this.onboarding.hasNext() ? $localize`Next step` : $localize`Finish onboarding`,
  );

  /**
   * Formats a localized accessible label for a step indicator dot button.
   *
   * @param index - Zero-based step index.
   * @param title - Localized step title.
   * @returns Localized accessible label string.
   */
  getStepDotAriaLabel(index: number, title: string): string {
    return $localize`Go to step ${index + 1}\: ${title}`;
  }

  /**
   * Advances to the next step.
   */
  next(): void {
    this.onboarding.next();
  }

  /**
   * Goes back to the previous step.
   */
  prev(): void {
    this.onboarding.prev();
  }

  /**
   * Skips the onboarding wizard.
   */
  skip(): void {
    this.onboarding.skip();
  }

  /**
   * Navigates to the current step's action route and completes onboarding.
   */
  navigateToAction(): void {
    const route = this.onboarding.currentStep().actionRoute;
    if (route) {
      this.onboarding.complete();
      this.router.navigate([route]);
    }
  }
}
