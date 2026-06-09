/** @docs */
/**
 * @fileoverview Unit tests for OnboardingWizardComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { PLATFORM_ID, signal } from '@angular/core';
import { vi } from 'vitest';
import { OnboardingWizardComponent } from './onboarding-wizard.component';
import { OnboardingService, ONBOARDING_STEPS } from './onboarding.service';

describe('OnboardingWizardComponent', () => {
  let component: OnboardingWizardComponent;
  let fixture: ComponentFixture<OnboardingWizardComponent>;
  let router: Router;

  const currentStepIndexSig = signal(0);
  const hasNextSig = signal(true);
  const hasPrevSig = signal(false);
  const progressSig = signal(20);
  const totalStepsSig = signal(ONBOARDING_STEPS.length);
  const currentStepSig = signal(ONBOARDING_STEPS[0]);

  const mockOnboarding = {
    isVisible: signal(true),
    isComplete: signal(false),
    currentStepIndex: currentStepIndexSig,
    currentStep: currentStepSig,
    totalSteps: totalStepsSig,
    hasNext: hasNextSig,
    hasPrev: hasPrevSig,
    progress: progressSig,
    next: vi.fn(),
    prev: vi.fn(),
    skip: vi.fn(),
    complete: vi.fn(),
    start: vi.fn(),
    goToStep: vi.fn(),
    reset: vi.fn(),
  };

  beforeEach(async () => {
    currentStepIndexSig.set(0);
    currentStepSig.set(ONBOARDING_STEPS[0]);
    hasPrevSig.set(false);
    hasNextSig.set(true);
    progressSig.set(20);
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [OnboardingWizardComponent, NoopAnimationsModule],
      providers: [
        { provide: OnboardingService, useValue: mockOnboarding },
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingWizardComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the wizard card', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="onboarding-wizard"]')).toBeTruthy();
  });

  it('should display the current step title', () => {
    const title = fixture.nativeElement.querySelector('.step-title');
    expect(title?.textContent?.trim()).toBe(ONBOARDING_STEPS[0].title);
  });

  it('should display the current step description', () => {
    const desc = fixture.nativeElement.querySelector('.step-description');
    expect(desc?.textContent?.trim()).toBe(ONBOARDING_STEPS[0].description);
  });

  it('should display the step counter', () => {
    const counter = fixture.nativeElement.querySelector('.step-counter');
    expect(counter?.textContent).toContain('1');
    expect(counter?.textContent).toContain(ONBOARDING_STEPS.length.toString());
  });

  it('should render one dot per step', () => {
    const dots = fixture.nativeElement.querySelectorAll('.dot');
    expect(dots.length).toBe(ONBOARDING_STEPS.length);
  });

  it('should mark the active dot', () => {
    expect(fixture.nativeElement.querySelector('.dot.active')).toBeTruthy();
  });

  it('should call onboarding.next() when Next button clicked', () => {
    fixture.nativeElement.querySelector('[data-testid="next-button"]')?.click();
    expect(mockOnboarding.next).toHaveBeenCalledTimes(1);
  });

  it('should call onboarding.prev() when Back button clicked', () => {
    hasPrevSig.set(true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="prev-button"]')?.click();
    expect(mockOnboarding.prev).toHaveBeenCalledTimes(1);
  });

  it('should disable Back button on first step', () => {
    hasPrevSig.set(false);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="prev-button"]');
    expect(btn?.disabled).toBe(true);
  });

  it('should call onboarding.skip() when skip button clicked', () => {
    fixture.nativeElement.querySelector('[data-testid="skip-button"]')?.click();
    expect(mockOnboarding.skip).toHaveBeenCalledTimes(1);
  });

  it('should call onboarding.goToStep(1) when dot 1 is clicked', () => {
    fixture.nativeElement.querySelector('[data-testid="step-dot-1"]')?.click();
    expect(mockOnboarding.goToStep).toHaveBeenCalledWith(1);
  });

  it('should show "Get Started" on last step', () => {
    hasNextSig.set(false);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="next-button"]');
    expect(btn?.textContent).toContain('Get Started');
  });

  it('should show "Next" when not on last step', () => {
    hasNextSig.set(true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="next-button"]');
    expect(btn?.textContent).toContain('Next');
  });

  it('should show action button for a step with actionLabel and actionRoute', () => {
    const stepWithAction = ONBOARDING_STEPS.find((s) => s.actionLabel && s.actionRoute);
    if (stepWithAction) {
      currentStepSig.set(stepWithAction);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('[data-testid="action-button"]');
      expect(btn).toBeTruthy();
      expect(btn?.textContent?.trim()).toBe(stepWithAction.actionLabel);
    }
  });

  it('should not show action button for a step without actionLabel', () => {
    const stepWithoutAction = ONBOARDING_STEPS.find((s) => !s.actionLabel);
    if (stepWithoutAction) {
      currentStepSig.set(stepWithoutAction);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="action-button"]')).toBeNull();
    }
  });

  it('navigateToAction() calls complete() and navigates to the action route', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const stepWithAction = ONBOARDING_STEPS.find((s) => s.actionRoute)!;
    currentStepSig.set(stepWithAction);
    fixture.detectChanges();

    component.navigateToAction();
    await fixture.whenStable();

    expect(mockOnboarding.complete).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith([stepWithAction.actionRoute]);
  });

  it('navigateToAction() does nothing when no actionRoute', () => {
    currentStepSig.set({ ...ONBOARDING_STEPS[0], actionRoute: undefined });
    fixture.detectChanges();
    component.navigateToAction();
    expect(mockOnboarding.complete).not.toHaveBeenCalled();
  });

  it('should have role="dialog" on overlay', () => {
    expect(fixture.nativeElement.querySelector('.overlay')?.getAttribute('role')).toBe('dialog');
  });

  it('should have aria-modal="true" on overlay', () => {
    expect(fixture.nativeElement.querySelector('.overlay')?.getAttribute('aria-modal')).toBe('true');
  });

  it('should have aria-label on skip button', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="skip-button"]');
    expect(btn?.getAttribute('aria-label')).toBe('Skip onboarding');
  });

  it('steps property equals ONBOARDING_STEPS', () => {
    expect(component.steps).toBe(ONBOARDING_STEPS);
  });
});
