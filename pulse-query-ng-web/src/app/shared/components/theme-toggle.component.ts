/** @docs */
/**
 * @fileoverview Theme Toggle Component.
 * Provides a button to toggle between light and dark themes.
 * Uses the ThemeService to manage theme state and persistence.
 */

import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '../../core/theme/theme.service';

/**
 * Theme Toggle Component.
 *
 * Displays an icon button that toggles between light and dark themes.
 * The icon changes based on the current theme mode.
 *
 * @example
 * ```html
 * <app-theme-toggle />
 * ```
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      mat-icon-button
      (click)="toggleTheme()"
      [matTooltip]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
      aria-label="Toggle theme"
      data-testid="theme-toggle"
    >
      <mat-icon>{{ isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
    `,
  ],
})
export class ThemeToggleComponent {
  private readonly themeService = inject(ThemeService);

  /**
   * Signal indicating whether dark mode is active.
   */
  readonly isDark = this.themeService.isDark;

  /**
   * Toggles between light and dark theme modes.
   */
  toggleTheme(): void {
    this.themeService.toggle();
  }
}
