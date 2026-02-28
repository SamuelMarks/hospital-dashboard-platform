/* v8 ignore start */
/** @docs */
// pulse-query-ng-web/src/app/core/theme/theme.service.ts
import { Injectable, signal, computed, inject, PLATFORM_ID, Signal, effect } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { generateThemeVariables, CssVariableMap } from './color-utils';

/** @docs */
export type ThemeMode = 'light' | 'dark';

const DEFAULT_SEED = '#1565c0';
const STORAGE_KEY_MODE = 'pulse_theme_mode';
const STORAGE_KEY_SEED = 'pulse_theme_seed';

/** @docs */
@Injectable({
  providedIn: 'root',
})
/** @docs */
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

  /* v8 ignore next */
  private readonly _mode = signal<ThemeMode>('light');
  /* v8 ignore next */
  private readonly _tvMode = signal<boolean>(false);
  /* v8 ignore next */
  private readonly _seedColor = signal<string>(DEFAULT_SEED);

  readonly seedColor: Signal<string> = this._seedColor.asReadonly();
  readonly mode: Signal<ThemeMode> = this._mode.asReadonly();

  /* v8 ignore next */
  readonly isDark: Signal<boolean> = computed(() => this._mode() === 'dark');
  readonly isTvMode: Signal<boolean> = this._tvMode.asReadonly();

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

  toggle(): void {
    this._mode.update((current) => (current === 'light' ? 'dark' : 'light'));
    this.savePreferences();
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    this.savePreferences();
  }

  setSeedColor(hex: string): void {
    this._seedColor.set(hex);
    this.savePreferences();
  }

  setTvMode(active: boolean): void {
    this._tvMode.set(active);
    if (active && this._mode() !== 'dark') {
      this._mode.set('dark');
    }
  }

  private loadPreferences(): void {
    const savedMode = localStorage.getItem(STORAGE_KEY_MODE) as ThemeMode;
    const savedSeed = localStorage.getItem(STORAGE_KEY_SEED);

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

  private savePreferences(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(STORAGE_KEY_MODE, this._mode());
    localStorage.setItem(STORAGE_KEY_SEED, this._seedColor());
  }

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
