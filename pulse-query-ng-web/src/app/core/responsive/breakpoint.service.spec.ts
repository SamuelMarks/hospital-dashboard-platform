/** @docs */
/**
 * @fileoverview Unit tests for BreakpointService.
 */

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { BreakpointService, BREAKPOINTS } from './breakpoint.service';

/** Helper: create a fresh service with a given innerWidth/innerHeight. */
function createService(width: number, height = 768): BreakpointService {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      BreakpointService,
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });
  return TestBed.inject(BreakpointService);
}

describe('BreakpointService', () => {
  afterEach(() => {
    // Restore sensible defaults
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 });
  });

  it('should be created', () => {
    const svc = createService(1024);
    expect(svc).toBeTruthy();
  });

  it('should expose width and height signals', () => {
    const svc = createService(1024, 768);
    expect(svc.width()).toBe(1024);
    expect(svc.height()).toBe(768);
  });

  it('should report xs breakpoint at 400px', () => {
    const svc = createService(400);
    expect(svc.currentBreakpoint()).toBe('xs');
    expect(svc.isMobile()).toBe(true);
    expect(svc.isTablet()).toBe(false);
    expect(svc.isDesktop()).toBe(false);
  });

  it('should report sm breakpoint at 700px', () => {
    const svc = createService(700);
    expect(svc.currentBreakpoint()).toBe('sm');
    expect(svc.isMobile()).toBe(true);
  });

  it('should report md breakpoint at 1000px', () => {
    const svc = createService(1000);
    expect(svc.currentBreakpoint()).toBe('md');
    expect(svc.isTablet()).toBe(true);
    expect(svc.isMobile()).toBe(false);
    expect(svc.isDesktop()).toBe(false);
  });

  it('should report lg breakpoint at 1400px', () => {
    const svc = createService(1400);
    expect(svc.currentBreakpoint()).toBe('lg');
    expect(svc.isDesktop()).toBe(true);
  });

  it('should report xl breakpoint at 2000px', () => {
    const svc = createService(2000);
    expect(svc.currentBreakpoint()).toBe('xl');
    expect(svc.isDesktop()).toBe(true);
  });

  it('matches() returns true for current breakpoint', () => {
    const svc = createService(1000);
    expect(svc.matches('md')).toBe(true);
    expect(svc.matches('sm')).toBe(false);
  });

  it('isAtLeast() returns true when at or above threshold', () => {
    const svc = createService(1000);
    expect(svc.isAtLeast('sm')).toBe(true);
    expect(svc.isAtLeast('md')).toBe(true);
    expect(svc.isAtLeast('lg')).toBe(false);
  });

  it('isBelow() returns true when below threshold', () => {
    const svc = createService(1000);
    expect(svc.isBelow('lg')).toBe(true);
    expect(svc.isBelow('md')).toBe(false);
  });

  it('should detect portrait orientation', () => {
    const svc = createService(500, 900);
    expect(svc.isPortrait()).toBe(true);
    expect(svc.isLandscape()).toBe(false);
  });

  it('should detect landscape orientation', () => {
    const svc = createService(900, 500);
    expect(svc.isLandscape()).toBe(true);
    expect(svc.isPortrait()).toBe(false);
  });

  it('BREAKPOINTS constants are correct', () => {
    expect(BREAKPOINTS.xs).toBe(0);
    expect(BREAKPOINTS.sm).toBe(600);
    expect(BREAKPOINTS.md).toBe(960);
    expect(BREAKPOINTS.lg).toBe(1280);
    expect(BREAKPOINTS.xl).toBe(1920);
  });
});
