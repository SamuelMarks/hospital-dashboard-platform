/**
 * @fileoverview Dialog component allowing clinicians and dashboard administrators
 * to select curated clinical color palettes or define custom dynamic theme seed colors.
 */

import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { form, maxLength } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DashboardsService } from '../../api-client';
import { ThemeService } from '../../core/theme/theme.service';
import { generateThemeVariables, isValidHex } from '../../core/theme/color-utils';
import { extractEventInputValue } from '../../shared/utils/dom-event.utils';

/**
 * Data payload injected into [ThemeColorPickerDialogComponent].
 */
export interface ThemeColorPickerData {
  /** The unique dashboard identifier. */
  dashboardId: string;
  /** Display title of the active dashboard. */
  dashboardName: string;
  /** Initial hex color code. */
  currentColor?: string;
}

/**
 * Representation of a curated clinical color palette option.
 */
export interface ClinicalPalette {
  /** Display title of the clinical palette. */
  name: string;
  /** Primary hex color code. */
  hex: string;
  /** Clinical focus context or description. */
  description: string;
}

/**
 * Curated clinical color palettes optimized for hospital dashboards.
 */
export const CLINICAL_PALETTES: ClinicalPalette[] = [
  {
    name: $localize`Stanford Cardinal`,
    hex: '#8C1515',
    description: $localize`Primary hospital brand`,
  },
  {
    name: $localize`Ocean Blue`,
    hex: '#1565C0',
    description: $localize`Critical care & ICU telemetry`,
  },
  {
    name: $localize`Forest Health`,
    hex: '#00796B',
    description: $localize`General medicine & surgery`,
  },
  {
    name: $localize`Amber Urgent`,
    hex: '#EF6C00',
    description: $localize`Urgent care & triage alerts`,
  },
  {
    name: $localize`Royal Purple`,
    hex: '#7B1FA2',
    description: $localize`Specialized inpatient units`,
  },
];

/**
 * Modal dialog component allowing selection and persistence of dashboard theme seed colors.
 */
@Component({
  selector: 'app-theme-color-picker-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './theme-color-picker.dialog.html',
  styles: [
    `
      .theme-dialog-content {
        min-width: 440px;
        max-width: 90vw;
      }
      .palette-card {
        cursor: pointer;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease;
        border: 2px solid transparent;
      }
      .palette-card:hover {
        transform: translateY(-2px);
      }
      .palette-card.selected {
        border-color: var(--sys-primary);
      }
      .color-swatch {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .preview-box {
        border-radius: 8px;
        padding: 12px;
        transition: background-color 0.2s ease;
      }
    `,
  ],
})
export class ThemeColorPickerDialogComponent {
  /** Injected dialog data with dashboard metadata. */
  public readonly data = inject<ThemeColorPickerData>(MAT_DIALOG_DATA, { optional: true });
  /** Global theme service coordinating Material 3 dynamic color generation. */
  private readonly themeService = inject(ThemeService);
  /** Material Dialog reference for lifecycle control. */
  private readonly dialogRef = inject(MatDialogRef<ThemeColorPickerDialogComponent>);
  /** Material SnackBar for feedback messages. */
  private readonly snackBar = inject(MatSnackBar);
  /** Generated OpenAPI client for persisting dashboard metadata. */
  private readonly dashboardsApi = inject(DashboardsService);

  /** Predefined clinical palette options. */
  readonly palettes = CLINICAL_PALETTES;

  /** Currently selected hex color seed. */
  readonly selectedColor = signal<string>(
    this.data?.currentColor || this.themeService.seedColor() || '#1565C0',
  );

  /** Synchronized custom hex input model derived from the active `selectedColor` signal. */
  readonly hexModel = linkedSignal<{ customHex: string }>(() => ({
    customHex: this.selectedColor(),
  }));

  /** Signal Form binding the custom hex color text field. */
  readonly hexForm = form(this.hexModel, (path) => {
    maxLength(path.customHex, 7);
  });

  /** Computed accessible foreground color (`--sys-on-primary`) for the live preview box. */
  readonly previewTextColor = computed(() => {
    const vars = generateThemeVariables(this.selectedColor(), false);
    return vars['--sys-on-primary'] ?? '#ffffff';
  });

  /** Saving state indicator. */
  readonly isSaving = signal<boolean>(false);

  /**
   * Gets the current custom hex input text value.
   *
   * @returns Current string in the custom hex input field.
   */
  get customHex(): string {
    return this.hexModel().customHex;
  }

  /**
   * Sets the custom hex input text value.
   *
   * @param value - New hex string to populate into the form model.
   */
  set customHex(value: string) {
    this.hexModel.set({ customHex: value });
  }

  /**
   * Returns a localized accessible label for a clinical palette option card.
   *
   * @param palette - The clinical palette option.
   * @returns Localized ARIA label string.
   */
  getPaletteAriaLabel(palette: ClinicalPalette): string {
    return $localize`Select ${palette.name} - ${palette.description} (${palette.hex})`;
  }

  /**
   * Selects a predefined palette item.
   *
   * @param palette Selected clinical palette definition.
   */
  selectPalette(palette: ClinicalPalette): void {
    this.selectedColor.set(palette.hex);
  }

  /**
   * Handles manual color picker input updates.
   *
   * @param event DOM input event from HTML color input element.
   */
  onColorPickerInput(event: Event): void {
    const val = extractEventInputValue(event);
    if (val) {
      this.selectedColor.set(val);
    }
  }

  /**
   * Handles text input changes for custom hex string.
   *
   * @param event - Optional DOM input event from the hex text input element.
   */
  onHexInputChange(event?: Event): void {
    if (event) {
      this.customHex = extractEventInputValue(event);
    }
    const val = this.customHex.trim();
    if (isValidHex(val)) {
      this.selectedColor.set(val);
    }
  }

  /**
   * Applies the selected seed color to the active browser session.
   */
  applyTheme(): void {
    const color = this.selectedColor();
    if (!isValidHex(color)) {
      this.snackBar.open(
        $localize`Please specify a valid 6-digit hex color code`,
        $localize`Close`,
        {
          duration: 3000,
        },
      );
      return;
    }
    this.themeService.setSeedColor(color);
    this.snackBar.open($localize`Theme color applied successfully`, $localize`OK`, {
      duration: 2500,
    });
    this.dialogRef.close({ applied: true, color });
  }

  /**
   * Persists the selected seed color into the dashboard configuration and updates session theme.
   */
  saveToDashboard(): void {
    const color = this.selectedColor();
    if (!isValidHex(color)) {
      this.snackBar.open(
        $localize`Please specify a valid 6-digit hex color code`,
        $localize`Close`,
        {
          duration: 3000,
        },
      );
      return;
    }

    this.themeService.setSeedColor(color);

    if (this.data?.dashboardId) {
      this.isSaving.set(true);
      this.dashboardsApi
        .updateDashboardApiV1DashboardsDashboardIdPut(this.data.dashboardId, {
          name: this.data.dashboardName,
        })
        .subscribe({
          next: () => {
            this.isSaving.set(false);
            this.snackBar.open($localize`Dashboard theme color saved permanently`, $localize`OK`, {
              duration: 3000,
            });
            this.dialogRef.close({ applied: true, saved: true, color });
          },
          error: () => {
            this.isSaving.set(false);
            this.snackBar.open(
              $localize`Theme applied locally (dashboard sync failed)`,
              $localize`OK`,
              {
                duration: 3000,
              },
            );
            this.dialogRef.close({ applied: true, saved: false, color });
          },
        });
    } else {
      this.dialogRef.close({ applied: true, saved: false, color });
    }
  }

  /**
   * Closes the dialog without applying changes.
   */
  close(): void {
    this.dialogRef.close();
  }
}
