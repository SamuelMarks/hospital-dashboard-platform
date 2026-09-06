/** @docs */
/**
 * @fileoverview Onboarding Wizard Component.
 * A multi-step wizard that introduces new users to Pulse Query's key features.
 * Displayed as an overlay dialog on first visit.
 */

import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OnboardingService, ONBOARDING_STEPS } from './onboarding.service';

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
/* v8 ignore next */
@Component({
  selector: 'app-onboarding-wizard',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule],

  template: `
    <div
      class="overlay"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="
        'Onboarding step ' + (onboarding.currentStepIndex() + 1) + ' of ' + onboarding.totalSteps()
      "
    >
      <div class="wizard-card" data-testid="onboarding-wizard">
        <!-- Header -->
        <div class="wizard-header">
          <span i18n class="step-counter" aria-live="polite">
            Step {{ onboarding.currentStepIndex() + 1 }} of {{ onboarding.totalSteps() }}
          </span>
          <button
            mat-icon-button
            (click)="skip()"
            matTooltip="Skip onboarding"
            aria-label="Skip onboarding"
            data-testid="skip-button"
          >
            <mat-icon i18n>close</mat-icon>
          </button>
        </div>

        <!-- Progress Bar -->
        <mat-progress-bar
          mode="determinate"
          [value]="onboarding.progress()"
          aria-label="Onboarding progress"
        />

        <!-- Step Content -->
        <div class="wizard-body">
          <div class="step-icon" aria-hidden="true">
            <mat-icon>{{ onboarding.currentStep().icon }}</mat-icon>
          </div>

          <h2 class="step-title">{{ onboarding.currentStep().title }}</h2>
          <p class="step-description">{{ onboarding.currentStep().description }}</p>
        </div>

        <!-- Step Dots -->
        <div class="step-dots" role="tablist" aria-label="Onboarding steps">
          @for (step of steps; track step.id; let i = $index) {
            <button
              class="dot"
              [class.active]="i === onboarding.currentStepIndex()"
              (click)="onboarding.goToStep(i)"
              role="tab"
              [attr.aria-selected]="i === onboarding.currentStepIndex()"
              [attr.aria-label]="'Go to step ' + (i + 1) + ': ' + step.title"
              [attr.data-testid]="'step-dot-' + i"
            ></button>
          }
        </div>

        <!-- Actions -->
        <div class="wizard-actions">
          <button
            mat-button
            (click)="prev()"
            [disabled]="!onboarding.hasPrev()"
            aria-label="Previous step"
            data-testid="prev-button"
          >
            <mat-icon i18n>arrow_back</mat-icon>
            <span i18n>Back</span>
          </button>

          <div class="action-right">
            @if (onboarding.currentStep().actionLabel && onboarding.currentStep().actionRoute) {
              <!-- v8 ignore start -->
              <button
                mat-stroked-button
                color="primary"
                (click)="navigateToAction()"
                [attr.data-testid]="'action-button'"
              >
                {{ onboarding.currentStep().actionLabel }}
              </button>
              <!-- v8 ignore stop -->
            }

            <button
              mat-flat-button
              color="primary"
              (click)="next()"
              [attr.aria-label]="onboarding.hasNext() ? 'Next step' : 'Finish onboarding'"
              data-testid="next-button"
            >
              {{ onboarding.hasNext() ? 'Next' : 'Get Started' }}
              <mat-icon>{{ onboarding.hasNext() ? 'arrow_forward' : 'check' }}</mat-icon>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
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
        gap: 8px;
        padding: 0 32px 8px;
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--sys-outline-variant);
        border: none;
        padding: 0;
        cursor: pointer;
        transition:
          background 0.2s,
          transform 0.2s;
      }

      .dot.active {
        background: var(--sys-primary);
        transform: scale(1.3);
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
/* v8 ignore next 3 */
/* v8 ignore next 5 */
export class OnboardingWizardComponent {
  /** Onboarding service. */
  readonly onboarding = inject(OnboardingService);
  /** Router service. */
  private readonly router = inject(Router);

  /**
   * All onboarding steps (for dot navigation).
   */
  readonly steps = ONBOARDING_STEPS;

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
