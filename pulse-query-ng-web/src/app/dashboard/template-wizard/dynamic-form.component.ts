/**
 * @fileoverview Reusable Dynamic Form Generator.
 *
 * Parses a subset of JSON Schema (Draft 7) to generate Angular Reactive Forms on the fly.
 * Supports:
 * - Text / Number inputs
 * - Dropdowns (enums)
 * - Checkboxes (boolean)
 * - Date pickers (format: date)
 * - Validation (required, min, max)
 */

import {
  Component,
  input,
  output,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  signal,
  LOCALE_ID,
} from '@angular/core';
import { formatDate } from '@angular/common';
import {
  ReactiveFormsModule,
  FormGroup,
  FormControl,
  Validators,
  ValidatorFn,
} from '@angular/forms';
import { Subscription } from 'rxjs';

// Material Imports
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideNativeDateAdapter } from '@angular/material/core';

/**
 * Typings for Supported JSON Schema Features.
 */
interface JsonSchemaProperty {
  /** Primitive JSON Schema data type for the form control. */
  type: 'string' | 'number' | 'integer' | 'boolean';
  /** Human-readable label displayed above the form field. */
  title?: string;
  /** Help text or tooltip describing the parameter's clinical purpose. */
  description?: string;
  /** Allowed enumeration values rendered as a select dropdown. */
  enum?: string[] | number[];
  /** Semantic string format hint such as date, date-time, or email. */
  format?: 'date' | 'date-time' | 'email';
  /** Default value pre-populated when initializing the control. */
  default?: string | number | boolean;
  /** Minimum inclusive numeric value constraint. */
  minimum?: number;
  /** Maximum inclusive numeric value constraint. */
  maximum?: number;
}

/** Root JSON Schema object describing a widget template's configurable parameters. */
interface JsonSchema {
  /** Root schema structural type (typically 'object'). */
  type: string;
  /** Array of property keys that require non-empty user values. */
  required?: string[];
  /** Map of parameter keys to their JSON Schema property definitions. */
  properties?: Record<string, JsonSchemaProperty>;
}

/**
 * Dynamic Form Component.
 *
 * **Updates:**
 * - Fully typed schema parsing.
 * - Reactive Output signals.
 * - Optimized OnPush detection.
 */
@Component({
  selector: 'app-dynamic-form',
  // '' removed (default).
  providers: [provideNativeDateAdapter()],
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule,
  ],

  templateUrl: './dynamic-form.component.html',
  styles: [
    `
      :host {
        display: block;
      }
      .dynamic-form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
      }
      .checkbox-row {
        display: flex;
        align-items: center;
        height: 56px; /* Match form field height */
      }
      .help-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--sys-text-secondary);
        margin-left: 8px;
        cursor: help;
      }
      .empty-state {
        text-align: center;
        color: var(--sys-text-secondary);
        padding: 24px;
        font-style: italic;
        grid-column: 1/-1;
      }
    `,
  ],
})
export class DynamicFormComponent implements OnChanges, OnDestroy {
  /** Injected application locale identifier. */
  private readonly localeId = inject(LOCALE_ID);
  /** Active subscription to `form.valueChanges`, cleaned up on rebuild and destroy. */
  private valueChangesSub = new Subscription();

  /** valid JSON Schema Object (subset). */
  readonly jsonSchema = input<Record<string, unknown>>({});

  /** Output emitting validity status. */
  readonly statusChange = output<'VALID' | 'INVALID'>();
  /** Output emitting extracted values. */
  readonly formValueChange = output<Record<string, unknown>>();

  /** Form. */
  readonly form = new FormGroup({});
  /** Field Keys. */
  readonly fieldKeys = signal<string[]>([]);

  /**
   * Rebuilds the reactive form when the input JSON schema changes.
   *
   * @param changes - Angular SimpleChanges map of changed input properties.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jsonSchema']) {
      this.rebuildForm();
    }
  }

  /**
   * Unsubscribes from reactive form value changes when the component is destroyed.
   */
  ngOnDestroy(): void {
    this.valueChangesSub.unsubscribe();
  }

  /**
   * Reconstructs the Form Group controls based on new Schema input.
   */
  private rebuildForm(): void {
    this.valueChangesSub.unsubscribe();

    // 1. Clear existing
    Object.keys(this.form.controls).forEach((k) => this.form.removeControl(k));

    // 2. Coerce type safely
    const raw = this.jsonSchema() || {};
    const schema = raw as unknown as JsonSchema;
    const props = schema.properties;
    // Ensure basic structure match
    if (!props) {
      this.fieldKeys.set([]);
      return;
    }

    const requiredList = schema.required || [];
    const entries = Object.entries(props);

    entries.forEach(([key, prop]) => {
      const validators: ValidatorFn[] = [];

      if (requiredList.includes(key)) {
        validators.push(Validators.required);
      }
      if (prop.type === 'number' || prop.type === 'integer') {
        if (prop.minimum !== undefined) validators.push(Validators.min(prop.minimum));
        if (prop.maximum !== undefined) validators.push(Validators.max(prop.maximum));
      }

      const control = new FormControl(prop.default ?? '', validators);
      this.form.addControl(key, control);
    });

    this.fieldKeys.set(Object.keys(props));

    // Subscribe to changes
    this.valueChangesSub = this.form.valueChanges.subscribe((val) => {
      // Emit status
      this.statusChange.emit(this.form.valid ? 'VALID' : 'INVALID');

      if (this.form.valid) {
        this.formValueChange.emit(this.cleanValues(val));
      }
    });
  }

  /**
   * Retrieves the JSON schema property definition for a given field key.
   *
   * @param key - The property key in the JSON schema.
   * @returns The property definition or null if not found.
   */
  getProperty(key: string): JsonSchemaProperty | null {
    const schema = this.jsonSchema() as unknown as JsonSchema; // Safe cast after rebuild
    return schema?.properties?.[key] || null;
  }

  /**
   * Checks whether a specific form control has the given validation error.
   *
   * @param key - The form control name.
   * @param errorName - The validator error key to check.
   * @returns True if the control currently has the specified error.
   */
  hasError(key: string, errorName: string): boolean {
    return this.form.get(key)?.hasError(errorName) ?? false;
  }

  /**
   * Formats a snake_case property key into a Title Case human-readable label.
   *
   * @param key - The raw property key.
   * @returns Formatted label string.
   */
  formatLabel(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Sanitizes form values before emission (e.g., converting Date instances to YYYY-MM-DD strings).
   *
   * @param raw - Raw key-value map from the reactive FormGroup.
   * @returns Sanitized key-value map.
   */
  private cleanValues(raw: Record<string, unknown>): Record<string, unknown> {
    const result = { ...raw };

    Object.keys(result).forEach((key) => {
      const prop = this.getProperty(key);
      const val = result[key];

      if (prop?.format === 'date' && val instanceof Date) {
        result[key] = formatDate(val, 'yyyy-MM-dd', this.localeId, 'UTC');
      }
    });
    return result;
  }
}
