/** 
 * @fileoverview Runtime Theme Service. 
 * 
 * Manages: 
 * 1. Visual Mode (Light / Dark). 
 * 2. Display Mode (Standard / TV Kiosk). 
 * 3. **Color Palette Generation** (M3 Dynamic Colors). 
 * 
 * Injects CSS Variables into the document root to update the entire app's look 
 * instantly without reloading or SCSS recompilation. 
 */ 

import { Injectable, signal, computed, inject, PLATFORM_ID, Signal, EffectRef, effect } from '@angular/core'; 
import { isPlatformBrowser, DOCUMENT } from '@angular/common'; 
import { generateThemeVariables, CssVariableMap } from './color-utils'; 

/** Type definition for supported theme visual modes. */ 
export type ThemeMode = 'light' | 'dark'; 

/** Default Seed Color (Material Blue 800 roughly). */ 
const DEFAULT_SEED = '#1565c0'; 
/** STORAGE KEY MODE constant. */
const STORAGE_KEY_MODE = 'pulse_theme_mode'; 
/** STORAGE KEY SEED constant. */
const STORAGE_KEY_SEED = 'pulse_theme_seed'; 

/** Theme service. */
@Injectable({ 
  providedIn: 'root' 
}) 
export class ThemeService { 
    /** platformId property. */
private readonly platformId = inject(PLATFORM_ID); 
    /** document property. */
private readonly document = inject(DOCUMENT); 

  // --- State Signals --- 
    /** _mode property. */
private readonly _mode = signal<ThemeMode>('light'); 
    /** _tvMode property. */
private readonly _tvMode = signal<boolean>(false); 
    /** _seedColor property. */
private readonly _seedColor = signal<string>(DEFAULT_SEED); 

  /** Valid Hex Color for the current theme seed. */ 
  readonly seedColor: Signal<string> = this._seedColor.asReadonly(); 
  
  /** Current Visual Mode (light/dark). */ 
  readonly mode: Signal<ThemeMode> = this._mode.asReadonly(); 
  
  /** Boolean helper for templates. */ 
  readonly isDark: Signal<boolean> = computed(() => this._mode() === 'dark'); 
  
  /** TV Kiosk Mode active state. */ 
  readonly isTvMode: Signal<boolean> = this._tvMode.asReadonly(); 

  /** Creates a new ThemeService. */
  constructor() { 
    // Hydrate from Storage (Browser only) 
    if (isPlatformBrowser(this.platformId)) { 
      this.loadPreferences(); 
    } 

    // Reactively update DOM when state changes 
    effect(() => { 
      const m = this.mode(); 
      const seed = this.seedColor(); 
      const isTv = this.isTvMode(); 

      // Only execute side-effects in browser 
      if (isPlatformBrowser(this.platformId)) { 
        this.applyThemeToDom(m, seed, isTv); 
      } 
    }); 
  } 

  /** 
  * Toggles between Light and Dark mode. 
  */ 
  toggle(): void { 
    this._mode.update(current => (current === 'light' ? 'dark' : 'light')); 
    this.savePreferences(); 
  } 

  /** 
  * Sets the theme mode explicitly. 
  * @param {ThemeMode} mode - 'light' or 'dark'. 
  */ 
  setMode(mode: ThemeMode): void { 
    this._mode.set(mode); 
    this.savePreferences(); 
  } 

  /** 
  * Updates the primary seed color for the application. 
  * Regenerates the entire palette. 
  * @param {string} hex - The new hex color (e.g. #ff0000). 
  */ 
  setSeedColor(hex: string): void { 
    this._seedColor.set(hex); 
    this.savePreferences(); 
  } 

  /** 
  * Toggles TV / Kiosk Mode. 
  * @param {boolean} active - State. 
  */ 
  setTvMode(active: boolean): void { 
    this._tvMode.set(active); 
    // TV mode forces Dark theme usually 
    if (active && this._mode() !== 'dark') { 
      this._mode.set('dark'); 
    } 
  } 

  /** 
  * Loads saved preferences from LocalStorage or detects OS preference. 
  */ 
  private loadPreferences(): void { 
    const savedMode = localStorage.getItem(STORAGE_KEY_MODE) as ThemeMode; 
    const savedSeed = localStorage.getItem(STORAGE_KEY_SEED); 

    if (savedMode && (savedMode === 'light' || savedMode === 'dark')) { 
      this._mode.set(savedMode); 
    } else { 
      // OS Preference 
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; 
      this._mode.set(prefersDark ? 'dark' : 'light'); 
    } 

    if (savedSeed) { 
      this._seedColor.set(savedSeed); 
    } 
  } 

  /** 
  * Persists current state to LocalStorage. 
  */ 
  private savePreferences(): void { 
    if (!isPlatformBrowser(this.platformId)) return; 
    localStorage.setItem(STORAGE_KEY_MODE, this._mode()); 
    localStorage.setItem(STORAGE_KEY_SEED, this._seedColor()); 
  } 

  /** 
  * Applies all styling changes to the DOM. 
  * 1. Generates CSS Custom Properties via ColorUtils. 
  * 2. Sets Body Classes. 
  * 
  * @param {ThemeMode} mode - Current mode. 
  * @param {string} seed - Current seed color. 
  * @param {boolean} isTv - Is TV mode active. 
  */ 
  private applyThemeToDom(mode: ThemeMode, seed: string, isTv: boolean): void { 
    const body = this.document.body; 
    const root = this.document.documentElement; 

    // 1. Classes 
    if (mode === 'dark') { 
      body.classList.add('dark-theme'); 
      body.classList.remove('light-theme'); 
    } else { 
      body.classList.add('light-theme'); 
      body.classList.remove('dark-theme'); 
    } 

    if (isTv) body.classList.add('mode-tv'); 
    else body.classList.remove('mode-tv'); 

    // 2. Generate Palette 
    const vars: CssVariableMap = generateThemeVariables(seed, mode === 'dark'); 

    // 3. Inject CSS Variables 
    Object.entries(vars).forEach(([key, value]) => { 
      root.style.setProperty(key, value); 
    }); 
  } 
}