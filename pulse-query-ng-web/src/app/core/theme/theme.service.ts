/**
 * @fileoverview Reactive theme service managing Material Design 3 dynamic color palettes,
 * light/dark appearance mode, and TV kiosk display mode.
 */

import { safeStorage } from '../storage.utils';
import { Injectable, signal, computed, inject, PLATFORM_ID, Signal, effect } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { generateThemeVariables, CssVariableMap } from './color-utils';

/** Supported visual appearance modes for the application theme. */
export type ThemeMode = 'light' | 'dark';

/** Default Material 3 seed color in hexadecimal format (Clinical Blue). */
const DEFAULT_SEED = '#1565c0';
/** LocalStorage key used to persist the user's selected light or dark theme mode. */
const STORAGE_KEY_MODE = 'pulse_theme_mode';
/** LocalStorage key used to persist the user's selected hexadecimal seed color. */
const STORAGE_KEY_SEED = 'pulse_theme_seed';

/**
 * Service managing the application's visual theme, dark/light mode state,
 * dynamic CSS variable injection, and TV kiosk mode.
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  /** Angular platform token used to guard DOM and storage access during SSR. */
  private readonly platformId = inject(PLATFORM_ID);
  /** Reference to the global DOM `Document` instance. */
  private readonly document = inject(DOCUMENT);

  /** Internal writable signal tracking the active theme mode (`'light'` or `'dark'`). */
  private readonly _mode = signal<ThemeMode>('light');

  /** Internal writable signal tracking whether TV kiosk mode is active. */
  private readonly _tvMode = signal<boolean>(false);

  /** Internal writable signal tracking the hexadecimal seed color for palette generation. */
  private readonly _seedColor = signal<string>(DEFAULT_SEED);

  /** Read-only signal exposing the active hexadecimal seed color. */
  readonly seedColor: Signal<string> = this._seedColor.asReadonly();
  /** Read-only signal exposing the active theme appearance mode. */
  readonly mode: Signal<ThemeMode> = this._mode.asReadonly();

  /** Computed signal returning `true` when the active theme mode is `'dark'`. */
  readonly isDark: Signal<boolean> = computed(() => this._mode() === 'dark');
  /** Read-only signal indicating whether TV kiosk mode is enabled. */
  readonly isTvMode: Signal<boolean> = this._tvMode.asReadonly();

  /**
   * Loads persisted theme preferences and registers a reactive effect to synchronize
   * theme classes and CSS custom properties with the DOM.
   */
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadPreferences();
    }

    effect(() => {
      const m = this.mode();
      const seed = this.seedColor();
      const isTv = this.isTvMode();

      if (isPlatformBrowser(this.platformId)) {
        this.applyThemeToDom(m, seed, isTv);
      }
    });
  }

  /**
   * Toggles the theme mode between `'light'` and `'dark'` and persists the new setting.
   */
  toggle(): void {
    this._mode.update((current) => (current === 'light' ? 'dark' : 'light'));
    this.savePreferences();
  }

  /**
   * Explicitly sets the theme appearance mode and persists the preference.
   *
   * @param mode - Target theme mode (`'light'` or `'dark'`).
   */
  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    this.savePreferences();
  }

  /**
   * Updates the Material Design 3 seed color and persists the preference.
   *
   * @param hex - New hexadecimal seed color string (e.g., `'#1565c0'`).
   */
  setSeedColor(hex: string): void {
    this._seedColor.set(hex);
    this.savePreferences();
  }

  /**
   * Enables or disables TV kiosk display mode, forcing dark mode when activated.
   *
   * @param active - Whether TV kiosk mode should be enabled.
   */
  setTvMode(active: boolean): void {
    this._tvMode.set(active);
    if (active && this._mode() !== 'dark') {
      this._mode.set('dark');
    }
  }

  /**
   * Loads saved theme mode and seed color from browser storage, falling back to OS color scheme preferences.
   */
  private loadPreferences(): void {
    const savedMode = safeStorage.getItem(STORAGE_KEY_MODE) as ThemeMode;
    const savedSeed = safeStorage.getItem(STORAGE_KEY_SEED);

    if (savedMode && (savedMode === 'light' || savedMode === 'dark')) {
      this._mode.set(savedMode);
    } else {
      const prefersDark =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this._mode.set(prefersDark ? 'dark' : 'light');
    }

    if (savedSeed) {
      this._seedColor.set(savedSeed);
    }
  }

  /**
   * Persists the current theme mode and seed color to browser local storage.
   */
  private savePreferences(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    safeStorage.setItem(STORAGE_KEY_MODE, this._mode());
    safeStorage.setItem(STORAGE_KEY_SEED, this._seedColor());
  }

  /**
   * Applies theme CSS classes to `document.body` and writes generated M3 CSS variables to `:root`.
   *
   * @param mode - Active appearance mode (`'light'` or `'dark'`).
   * @param seed - Hexadecimal seed color string used to compute tonal tokens.
   * @param isTv - Whether TV kiosk mode class (`mode-tv`) should be applied.
   */
  private applyThemeToDom(mode: ThemeMode, seed: string, isTv: boolean): void {
    const body = this.document.body;
    const root = this.document.documentElement;

    if (mode === 'dark') {
      body.classList.add('dark-theme');
      body.classList.remove('light-theme');
    } else {
      body.classList.add('light-theme');
      body.classList.remove('dark-theme');
    }

    if (isTv) body.classList.add('mode-tv');
    else body.classList.remove('mode-tv');

    const vars: CssVariableMap = generateThemeVariables(seed, mode === 'dark');

    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }
}
