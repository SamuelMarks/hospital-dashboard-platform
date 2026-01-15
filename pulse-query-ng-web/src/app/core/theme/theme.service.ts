import { Injectable, signal, computed, inject, PLATFORM_ID, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Type definition for supported theme modes. */
export type ThemeMode = 'light' | 'dark';

/**
 * Service to manage Application Theme (Light/Dark).
 *
 * Responsibilities:
 * 1. Toggles specific CSS classes (`light-theme` / `dark-theme`) on `document.body` to activate Material Themes.
 * 2. Persists user preference to `localStorage` to remember choice across sessions.
 * 3. Exposes reactive signals (`mode`, `isDark`) for components to adapt logic (e.g., Chart coloring).
 * 4. Automatically detects OS System Preference on first load.
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly STORAGE_KEY = 'pulse_theme_preference';

  /** Internal mutable state signal. */
  private readonly _mode = signal<ThemeMode>('light');

  /** Read-only signal for UI binding. */
  readonly mode: Signal<ThemeMode> = this._mode.asReadonly();

  /** Boolean computed helper for templates (e.g., `[class.dark]="isDark()"`). */
  readonly isDark: Signal<boolean> = computed(() => this._mode() === 'dark');

  constructor() {
    // Only access DOM/Storage in browser environment (SSR safety)
    if (isPlatformBrowser(this.platformId)) {
      this.initializeTheme();
    }
  }

  /**
   * Toggles the active theme between 'light' and 'dark'.
   */
  toggle(): void {
    this._mode.update(current => (current === 'light' ? 'dark' : 'light'));
    this.applyTheme(this._mode());
  }

  /**
   * Sets a specific theme mode explicitly.
   * @param mode - The desired theme ('light' or 'dark').
   */
  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    this.applyTheme(mode);
  }

  /**
   * Loads preference from storage or falls back to the OS system preference.
   * Prioritizes:
   * 1. LocalStorage value.
   * 2. Window `matchMedia` (prefers-color-scheme).
   * 3. Default ('light').
   */
  private initializeTheme(): void {
    const saved = localStorage.getItem(this.STORAGE_KEY) as ThemeMode;
    
    if (saved && (saved === 'light' || saved === 'dark')) {
      this.setMode(saved);
    } else {
      // Check OS preference
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setMode(prefersDark ? 'dark' : 'light');
    }
  }

  /**
   * Applies the theme class to the document body and saves state.
   * @param mode - The active theme mode.
   */
  private applyTheme(mode: ThemeMode): void {
    // Safety check for SSR or non-DOM environments
    if (!isPlatformBrowser(this.platformId)) return;

    const body = document.body;
    if (mode === 'dark') {
      body.classList.add('dark-theme');
      body.classList.remove('light-theme');
    } else {
      body.classList.add('light-theme');
      body.classList.remove('dark-theme');
    }
    
    localStorage.setItem(this.STORAGE_KEY, mode);
  }
}