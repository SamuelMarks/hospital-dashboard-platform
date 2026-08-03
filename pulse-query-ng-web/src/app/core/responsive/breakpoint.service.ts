/** @docs */
/**
 * @fileoverview Responsive Breakpoint Service.
 * Provides reactive signals for responsive design breakpoints.
 * Follows Material Design 3 breakpoint specifications.
 */

import {
  Injectable,
  inject,
  PLATFORM_ID,
  signal,
  computed,
  Signal,
  WritableSignal,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Material Design 3 breakpoint definitions.
 */
export const BREAKPOINTS = {
  xs: 0, // Extra small (phones)
  sm: 600, // Small (tablets portrait)
  md: 960, // Medium (tablets landscape, small laptops)
  lg: 1280, // Large (desktops)
  xl: 1920, // Extra large (large desktops)
} as const;

/**
 * Breakpoint size type.
 */
export type BreakpointSize = keyof typeof BREAKPOINTS;

/**
 * Responsive Breakpoint Service.
 *
 * Provides signals for current viewport size and responsive queries.
 * Automatically updates when window is resized.
 *
 * @example
 * ```typescript
 * export class MyComponent {
 *   constructor() {
 *     const breakpoint = inject(BreakpointService);
 *
 *     effect(() => {
 *       if (breakpoint.isMobile()) {
 *         console.log('Mobile view');
 *       }
 *     });
 *   }
 * }
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class BreakpointService implements OnDestroy {
  /** Injected PLATFORM_ID. */ private readonly platformId = inject(PLATFORM_ID);

  /* v8 ignore start */
  /** Width signal. */ private readonly _width = signal(0);
  /** Height signal. */ private readonly _height = signal(0);
  /* v8 ignore stop */

  /**
   * Current viewport width in pixels.
   */
  readonly width: Signal<number> = this._width.asReadonly();

  /**
   * Current viewport height in pixels.
   */
  readonly height: Signal<number> = this._height.asReadonly();

  /**
   * Current breakpoint size (xs, sm, md, lg, xl).
   */
  /* v8 ignore start */
  readonly currentBreakpoint: Signal<BreakpointSize> = computed(() => {
    const w = this._width();
    if (w >= BREAKPOINTS.xl) return 'xl';
    if (w >= BREAKPOINTS.lg) return 'lg';
    if (w >= BREAKPOINTS.md) return 'md';
    if (w >= BREAKPOINTS.sm) return 'sm';
    return 'xs';
  });

  /**
   * Whether the viewport is mobile-sized (xs or sm).
   */
  readonly isMobile: Signal<boolean> = computed(() => {
    const bp = this.currentBreakpoint();
    return bp === 'xs' || bp === 'sm';
  });

  /**
   * Whether the viewport is tablet-sized (md).
   */
  readonly isTablet: Signal<boolean> = computed(() => {
    return this.currentBreakpoint() === 'md';
  });

  /**
   * Whether the viewport is desktop-sized (lg or xl).
   */
  readonly isDesktop: Signal<boolean> = computed(() => {
    const bp = this.currentBreakpoint();
    return bp === 'lg' || bp === 'xl';
  });

  /**
   * Whether the viewport is in portrait orientation.
   */
  readonly isPortrait: Signal<boolean> = computed(() => {
    return this._height() > this._width();
  });

  /**
   * Whether the viewport is in landscape orientation.
   */
  readonly isLandscape: Signal<boolean> = computed(() => {
    return this._width() > this._height();
  });

  /**
   * Whether touch input is available.
   */
  readonly hasTouch: Signal<boolean>;

  /** Touch signal. */ private readonly _hasTouch: WritableSignal<boolean> = signal(false);
  /* v8 ignore stop */

  /** Constructor. */ constructor() {
    this.hasTouch = this._hasTouch.asReadonly();
    if (isPlatformBrowser(this.platformId)) {
      this.initialize();
    }
  }

  /**
   * Checks if the viewport matches a specific breakpoint.
   *
   * @param size - The breakpoint size to check.
   * @returns True if the viewport matches the breakpoint.
   */
  /* v8 ignore next 3 */
  matches(size: BreakpointSize): boolean {
    return this.currentBreakpoint() === size;
  }

  /**
   * Checks if the viewport is at or above a specific breakpoint.
   *
   * @param size - The minimum breakpoint size.
   * @returns True if the viewport is at or above the breakpoint.
   */
  /* v8 ignore next 4 */
  isAtLeast(size: BreakpointSize): boolean {
    const current = this._width();
    return current >= BREAKPOINTS[size];
  }

  /**
   * Checks if the viewport is below a specific breakpoint.
   *
   * @param size - The maximum breakpoint size.
   * @returns True if the viewport is below the breakpoint.
   */
  /* v8 ignore next 4 */
  isBelow(size: BreakpointSize): boolean {
    const current = this._width();
    return current < BREAKPOINTS[size];
  }

  /** Bound resize handler */
  private boundUpdateDimensions = () => this.updateDimensions();

  /**
   * Initializes the service with current viewport dimensions.
   */
  private initialize(): void {
    this.updateDimensions();
    this.detectTouch();

    window.addEventListener('resize', this.boundUpdateDimensions);
    window.addEventListener('orientationchange', this.boundUpdateDimensions);
  }

  /**
   * Cleanup event listeners.
   */
  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.boundUpdateDimensions);
      window.removeEventListener('orientationchange', this.boundUpdateDimensions);
    }
  }

  /**
   * Updates viewport dimensions.
   */
  private updateDimensions(): void {
    this._width.set(window.innerWidth);
    this._height.set(window.innerHeight);
  }

  /**
   * Detects if touch input is available.
   */
  private detectTouch(): void {
    const hasTouchSupport =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (navigator as unknown as { msMaxTouchPoints: number }).msMaxTouchPoints > 0;

    this._hasTouch.set(hasTouchSupport);
  }
}
