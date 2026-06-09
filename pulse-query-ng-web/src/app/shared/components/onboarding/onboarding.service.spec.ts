/** @docs */
/**
 * @fileoverview Unit tests for OnboardingService.
 */

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { vi } from 'vitest';
import { OnboardingService, ONBOARDING_STEPS } from './onboarding.service';

describe('OnboardingService', () => {
  function createService(platformId = 'browser'): OnboardingService {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        OnboardingService,
        { provide: PLATFORM_ID, useValue: platformId },
      ],
    });
    return TestBed.inject(OnboardingService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('should be created', () => {
    const svc = createService();
    expect(svc).toBeTruthy();
  });

  it('should show wizard on first visit (after 500ms)', () => {
    const svc = createService();
    expect(svc.isVisible()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(svc.isVisible()).toBe(true);
  });

  it('should not show wizard when already complete', () => {
    localStorage.setItem('pulse_onboarding_complete', 'true');
    const svc = createService();
    vi.advanceTimersByTime(500);
    expect(svc.isVisible()).toBe(false);
    expect(svc.isComplete()).toBe(true);
  });

  it('should not show wizard on server platform', () => {
    const svc = createService('server');
    vi.advanceTimersByTime(500);
    expect(svc.isVisible()).toBe(false);
  });

  it('start() shows wizard at step 0', () => {
    localStorage.setItem('pulse_onboarding_complete', 'true');
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    expect(svc.isVisible()).toBe(true);
    expect(svc.currentStepIndex()).toBe(0);
  });

  it('next() advances to next step', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    expect(svc.currentStepIndex()).toBe(0);
    svc.next();
    expect(svc.currentStepIndex()).toBe(1);
  });

  it('prev() goes back one step', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    svc.next();
    svc.prev();
    expect(svc.currentStepIndex()).toBe(0);
  });

  it('prev() does nothing on first step', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    svc.prev();
    expect(svc.currentStepIndex()).toBe(0);
  });

  it('next() on last step calls complete()', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    for (let i = 0; i < ONBOARDING_STEPS.length - 1; i++) {
      svc.next();
    }
    expect(svc.currentStepIndex()).toBe(ONBOARDING_STEPS.length - 1);
    svc.next();
    expect(svc.isComplete()).toBe(true);
    expect(svc.isVisible()).toBe(false);
  });

  it('goToStep() jumps to the given index', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    svc.goToStep(3);
    expect(svc.currentStepIndex()).toBe(3);
  });

  it('goToStep() ignores out-of-range indices', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    svc.goToStep(-1);
    expect(svc.currentStepIndex()).toBe(0);
    svc.goToStep(999);
    expect(svc.currentStepIndex()).toBe(0);
  });

  it('skip() marks complete and hides wizard', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.skip();
    expect(svc.isVisible()).toBe(false);
    expect(svc.isComplete()).toBe(true);
    expect(localStorage.getItem('pulse_onboarding_complete')).toBe('true');
  });

  it('complete() persists to localStorage', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.complete();
    expect(localStorage.getItem('pulse_onboarding_complete')).toBe('true');
  });

  it('reset() clears state and localStorage', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.complete();
    svc.reset();
    expect(svc.isComplete()).toBe(false);
    expect(svc.isVisible()).toBe(false);
    expect(localStorage.getItem('pulse_onboarding_complete')).toBeNull();
  });

  it('hasPrev is false on first step', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    expect(svc.hasPrev()).toBe(false);
  });

  it('hasNext is false on last step', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    svc.goToStep(ONBOARDING_STEPS.length - 1);
    expect(svc.hasNext()).toBe(false);
  });

  it('progress is 100 on last step', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    svc.goToStep(ONBOARDING_STEPS.length - 1);
    expect(svc.progress()).toBe(100);
  });

  it('progress is correct for first step', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    const expected = Math.round((1 / ONBOARDING_STEPS.length) * 100);
    expect(svc.progress()).toBe(expected);
  });

  it('currentStep returns the correct step object', () => {
    const svc = createService();
    vi.advanceTimersByTime(500);
    svc.start();
    expect(svc.currentStep()).toBe(ONBOARDING_STEPS[0]);
    svc.next();
    expect(svc.currentStep()).toBe(ONBOARDING_STEPS[1]);
  });

  it('totalSteps equals ONBOARDING_STEPS.length', () => {
    const svc = createService();
    expect(svc.totalSteps()).toBe(ONBOARDING_STEPS.length);
  });

  it('ONBOARDING_STEPS has at least 3 steps', () => {
    expect(ONBOARDING_STEPS.length).toBeGreaterThanOrEqual(3);
  });

  it('each step has required fields', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.title).toBe('string');
      expect(typeof step.description).toBe('string');
      expect(typeof step.icon).toBe('string');
    }
  });
});
