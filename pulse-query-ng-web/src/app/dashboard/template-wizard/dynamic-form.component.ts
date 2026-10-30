/**
 * @fileoverview Reusable Dynamic Form Generator.
 *
 * Parses a subset of JSON Schema (Draft 7) to generate reactive Signal-backed form controls on the fly.
 * Supports:
 * - Text / Number inputs
 * - Dropdowns (enums)
 * - Checkboxes (boolean)
 * - Date pickers (format: date)
 * - Validation (required, min, max)
 */

import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  LOCALE_ID,
  output,
  signal,
} from '@angular/core';
import { formatDate } from '@angular/common';

// Material Imports
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideNativeDateAdapter } from '@angular/material/core';
import { extractEventInputValue } from '../../shared/utils/dom-event.utils';

/**
 * Typings for Supported JSON Schema Features.
 */
export interface JsonSchemaProperty {
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
export interface JsonSchema {
  /** Root schema structural type (typically 'object'). */
  type: string;
  /** Array of property keys that require non-empty user values. */
  required?: string[];
  /** Map of parameter keys to their JSON Schema property definitions. */
  properties?: Record<string, JsonSchemaProperty>;
}

/**
 * Type guard verifying whether an unknown record conforms to the `JsonSchema` structure.
 *
 * @param value - Unknown candidate object to inspect.
 * @returns True if the candidate is a non-null object compatible with `JsonSchema`.
 */
export function isJsonSchema(value: unknown): value is JsonSchema {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if ('properties' in value && value.properties !== undefined) {
    return typeof value.properties === 'object' && value.properties !== null;
  }
  return true;
}

/**
 * Dynamic Form Component powered by Angular Signals (`computed` and `linkedSignal`).
 */
@Component({
  selector: 'app-dynamic-form',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatButtonModule,
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
        height: 56px;
      }
      .help-icon-btn {
        color: var(--sys-text-secondary);
        margin-left: 4px;
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
export class DynamicFormComponent {
  /** Injected application locale identifier. */
  private readonly localeId = inject(LOCALE_ID);

  /** Input JSON Schema subset describing configurable template parameters. */
  readonly jsonSchema = input<Record<string, unknown> | null>({});

  /** Output signal emitting `'VALID'` or `'INVALID'` whenever form values change. */
  readonly statusChange = output<'VALID' | 'INVALID'>();
  /** Output signal emitting sanitized key-value pairs whenever the form is valid. */
  readonly formValueChange = output<Record<string, unknown>>();

  /** Parsed and narrowed JSON schema derived from the `jsonSchema` input signal. */
  readonly parsedSchema = computed<JsonSchema | null>(() => {
    const raw = this.jsonSchema();
    return isJsonSchema(raw) ? raw : null;
  });

  /** Ordered list of configurable parameter keys defined in the active schema. */
  readonly fieldKeys = computed<string[]>(() => {
    const props = this.parsedSchema()?.properties;
    return props ? Object.keys(props) : [];
  });

  /** Reactive map of parameter keys to their current user-entered values, synchronized with schema defaults. */
  readonly values = linkedSignal<Record<string, unknown>>(() => {
    const props = this.parsedSchema()?.properties;
    if (!props) {
      return {};
    }
    const defaults: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(props)) {
      defaults[key] = prop.default ?? (prop.type === 'boolean' ? false : '');
    }
    return defaults;
  });

  /** Set of field keys that have been interacted with by the user. */
  readonly touchedFields = signal<Record<string, boolean>>({});

  /** Computed map of validation errors per field key (`required`, `min`, `max`). */
  readonly errorsMap = computed<Record<string, Record<string, boolean>>>(() => {
    const schema = this.parsedSchema();
    const props = schema?.properties;
    if (!props) {
      return {};
    }
    const requiredSet = new Set(schema?.required ?? []);
    const currentValues = this.values();
    const errors: Record<string, Record<string, boolean>> = {};

    for (const [key, prop] of Object.entries(props)) {
      const fieldErrors: Record<string, boolean> = {};
      const val = currentValues[key];

      if (requiredSet.has(key)) {
        const isEmpty =
          val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
        if (isEmpty) {
          fieldErrors['required'] = true;
        }
      }

      if (
        (prop.type === 'number' || prop.type === 'integer') &&
        val !== '' &&
        val !== null &&
        val !== undefined
      ) {
        const num = typeof val === 'number' ? val : Number(val);
        if (!Number.isNaN(num)) {
          if (prop.minimum !== undefined && num < prop.minimum) {
            fieldErrors['min'] = true;
          }
          if (prop.maximum !== undefined && num > prop.maximum) {
            fieldErrors['max'] = true;
          }
        }
      }

      errors[key] = fieldErrors;
    }

    return errors;
  });

  /** Computed boolean indicating whether all schema constraints are currently satisfied. */
  readonly isValid = computed<boolean>(() => {
    const errMap = this.errorsMap();
    return Object.values(errMap).every((fieldErrs) => Object.keys(fieldErrs).length === 0);
  });

  /**
   * Retrieves the JSON schema property definition for a given field key.
   *
   * @param key - The property key in the JSON schema.
   * @returns The property definition or null if not found.
   */
  getProperty(key: string): JsonSchemaProperty | null {
    return this.parsedSchema()?.properties?.[key] ?? null;
  }

  /**
   * Retrieves the current value for a given field key.
   *
   * @param key - The parameter key in the form state.
   * @returns Current value of the field.
   */
  getValue(key: string): unknown {
    return this.values()[key];
  }

  /**
   * Updates a single field's value and emits updated form validity and sanitized values.
   *
   * @param key - Parameter key to update.
   * @param value - New value for the parameter.
   */
  setFieldValue(key: string, value: unknown): void {
    this.touchedFields.update((t) => ({ ...t, [key]: true }));
    this.values.update((curr) => ({ ...curr, [key]: value }));
    this.emitCurrentState();
  }

  /**
   * Updates multiple field values simultaneously and emits updated form validity and values.
   *
   * @param patch - Key-value map of parameter updates to merge.
   */
  patchValues(patch: Record<string, unknown>): void {
    this.values.update((curr) => ({ ...curr, ...patch }));
    this.emitCurrentState();
  }

  /**
   * Handles native input events for text and numeric schema fields.
   *
   * @param key - Parameter key being edited.
   * @param event - DOM input event.
   */
  onTextOrNumberInput(key: string, event: Event): void {
    const raw = extractEventInputValue(event);
    const prop = this.getProperty(key);
    if (prop?.type === 'number' || prop?.type === 'integer') {
      const parsed = raw === '' ? '' : Number(raw);
      this.setFieldValue(key, parsed);
      return;
    }
    this.setFieldValue(key, raw);
  }

  /**
   * Handles Material Datepicker change events.
   *
   * @param key - Parameter key being edited.
   * @param event - Material datepicker change event.
   */
  onDateChange(key: string, event: MatDatepickerInputEvent<Date>): void {
    this.setFieldValue(key, event.value);
  }

  /**
   * Checks whether a specific form control has the given validation error.
   *
   * @param key - The form control name.
   * @param errorName - The validator error key to check (`'required'`, `'min'`, `'max'`).
   * @returns True if the control currently has the specified error.
   */
  hasError(key: string, errorName: string): boolean {
    return Boolean(this.errorsMap()[key]?.[errorName]);
  }

  /**
   * Returns a localized accessible label for a field's help tooltip button.
   *
   * @param key - Parameter key.
   * @returns Localized ARIA label string.
   */
  getHelpAriaLabel(key: string): string {
    const label = this.getProperty(key)?.title || this.formatLabel(key);
    return $localize`Help info for ${label}`;
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
   * Emits the current validity status and, when valid, the sanitized parameter map.
   */
  private emitCurrentState(): void {
    const valid = this.isValid();
    this.statusChange.emit(valid ? 'VALID' : 'INVALID');
    if (valid) {
      this.formValueChange.emit(this.cleanValues(this.values()));
    }
  }

  /**
   * Sanitizes form values before emission (e.g., converting Date instances to YYYY-MM-DD strings).
   *
   * @param raw - Raw key-value map from the signal form state.
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
