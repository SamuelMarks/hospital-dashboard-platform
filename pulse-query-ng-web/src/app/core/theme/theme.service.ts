import { Injectable, signal, computed, inject, PLATFORM_ID, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Type definition for supported theme modes. */
export type ThemeMode = 'light' | 'dark';

/**
 * Service to manage Application Theme (Light/Dark) and Display Modes (TV/Kiosk).
 *
 * Responsibilities:
 * 1. Toggles specific CSS classes (`light-theme`, `dark-theme`, `mode-tv`) on `document.body`.
 * 2. Persists user preference for Light/Dark mode.
 * 3. Exposes reactive signals (`mode`, `isDark`, `isTvMode`) for components.
 * 4. Automatically detects OS System Preference on first load.
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly STORAGE_KEY = 'pulse_theme_preference';

  /** Internal mutable state signal for color theme. */
  private readonly _mode = signal<ThemeMode>('light');
  
  /** Internal mutable state signal for TV Kiosk Mode. */
  private readonly _tvMode = signal<boolean>(false);

  /** Read-only signal for UI binding. */
  readonly mode: Signal<ThemeMode> = this._mode.asReadonly();

  /** Read-only signal indicating if Kiosk Mode is active. */
  readonly isTvMode: Signal<boolean> = this._tvMode.asReadonly();

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
   * Activates or Deactivates TV Kiosk Mode.
   * In TV mode, chrome is hidden and fonts are scaled.
   * 
   * @param active - Whether TV mode is on.
   */
  setTvMode(active: boolean): void {
    this._tvMode.set(active);
    
    if (isPlatformBrowser(this.platformId)) {
      const body = document.body;
      if (active) {
        body.classList.add('mode-tv');
        // TV Mode usually implies Dark Theme for better contrast/battery on OLEDs
        if (this._mode() !== 'dark') this.setMode('dark');
      } else {
        body.classList.remove('mode-tv');
      }
    }
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