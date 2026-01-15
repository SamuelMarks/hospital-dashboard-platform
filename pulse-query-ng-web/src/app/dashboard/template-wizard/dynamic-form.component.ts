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
  SimpleChanges, 
  inject, 
  ChangeDetectionStrategy, 
  signal
} from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { 
  ReactiveFormsModule, 
  FormGroup, 
  FormControl, 
  Validators, 
  ValidatorFn 
} from '@angular/forms'; 

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
  type: 'string' | 'number' | 'integer' | 'boolean'; 
  title?: string; 
  description?: string; 
  enum?: string[] | number[]; 
  format?: 'date' | 'date-time' | 'email'; 
  default?: string | number | boolean; 
  minimum?: number; 
  maximum?: number; 
} 

interface JsonSchema {
  type: string;
  required?: string[];
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
  // 'standalone: true' removed (default).
  providers: [provideNativeDateAdapter()], 
  imports: [ 
    CommonModule, 
    ReactiveFormsModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatSelectModule, 
    MatDatepickerModule, 
    MatCheckboxModule, 
    MatIconModule, 
    MatTooltipModule
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  template: `
    <form [formGroup]="form" class="dynamic-form-grid">
      
      @for (key of fieldKeys(); track key) { 
        @if (getProperty(key); as prop) { 
          
          <!-- Case 1: Boolean (Checkbox) -->
          @if (prop.type === 'boolean') { 
            <div class="checkbox-row">
              <mat-checkbox [formControlName]="key" color="primary">
                {{ prop.title || formatLabel(key) }} 
              </mat-checkbox>
              @if (prop.description) { 
                <mat-icon 
                  class="help-icon" 
                  [matTooltip]="prop.description" 
                  fontIcon="help_outline"
                  tabindex="0"
                  aria-label="Help info"
                ></mat-icon>
              } 
            </div>
          } 
          
          <!-- Case 2: Enumeration (Select Dropdown) -->
          @else if (prop.enum) { 
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ prop.title || formatLabel(key) }}</mat-label>
              <mat-select [formControlName]="key">
                @for (opt of prop.enum; track opt) { 
                  <mat-option [value]="opt">{{ opt }}</mat-option>
                } 
              </mat-select>
              @if (prop.description) { <mat-hint>{{ prop.description }}</mat-hint> } 
              <mat-error *ngIf="hasError(key, 'required')">Required</mat-error>
            </mat-form-field>
          } 

          <!-- Case 3: Date Picker -->
          @else if (prop.format === 'date') { 
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ prop.title || formatLabel(key) }}</mat-label>
              <input matInput [matDatepicker]="picker" [formControlName]="key">
              <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
              <mat-datepicker #picker></mat-datepicker>
              @if (prop.description) { <mat-hint>{{ prop.description }}</mat-hint> } 
              <mat-error *ngIf="hasError(key, 'required')">Required</mat-error>
            </mat-form-field>
          } 

          <!-- Case 4: Standard Input (Text/Number) -->
          @else { 
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ prop.title || formatLabel(key) }}</mat-label>
              <input 
                matInput 
                [type]="prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text'" 
                [formControlName]="key" 
                [min]="prop.minimum" 
                [max]="prop.maximum" 
              >
              @if (prop.description) { <mat-hint>{{ prop.description }}</mat-hint> } 
              <mat-error *ngIf="hasError(key, 'required')">Required</mat-error>
              <mat-error *ngIf="hasError(key, 'min')">Min value: {{prop.minimum}}</mat-error>
              <mat-error *ngIf="hasError(key, 'max')">Max value: {{prop.maximum}}</mat-error>
            </mat-form-field>
          } 

        } 
      } 

      @if (fieldKeys().length === 0) { 
        <div class="empty-state">
          No parameters required for this template. 
        </div>
      } 

    </form>
  `, 
  styles: [`
    :host { display: block; } 
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
      width: 16px; height: 16px; 
      color: var(--sys-text-secondary); 
      margin-left: 8px; 
      cursor: help; 
    } 
    .empty-state { text-align: center; color: var(--sys-text-secondary); padding: 24px; font-style: italic; grid-column: 1/-1; } 
  `] 
}) 
export class DynamicFormComponent implements OnChanges { 
  /** valid JSON Schema Object (subset). */ 
  readonly jsonSchema = input<Record<string, any>>({}); 
  
  /** Output emitting validity status. */ 
  readonly statusChange = output<'VALID' | 'INVALID'>(); 
  /** Output emitting extracted values. */
  readonly formValueChange = output<Record<string, any>>();

  readonly form = new FormGroup({}); 
  readonly fieldKeys = signal<string[]>([]); 

  ngOnChanges(changes: SimpleChanges): void { 
    if (changes['jsonSchema']) { 
      this.rebuildForm(); 
    } 
  } 

  /** 
   * Reconstructs the Form Group controls based on new Schema input.
   */ 
  private rebuildForm(): void { 
    // 1. Clear existing
    Object.keys(this.form.controls).forEach(k => this.form.removeControl(k)); 
    
    // 2. Coerce type safely
    const raw = this.jsonSchema() || {};
    // Ensure basic structure match
    if (!raw['properties']) { 
      this.fieldKeys.set([]); 
      return; 
    } 
    const schema = raw as JsonSchema;

    const props = schema.properties!; 
    const requiredList = schema.required || []; 
    const keys = Object.keys(props); 

    keys.forEach(key => { 
      const prop = props[key]; 
      const validators: ValidatorFn[] = []; 
      
      if (requiredList.includes(key)) { 
        validators.push(Validators.required); 
      } 
      if ((prop.type === 'number' || prop.type === 'integer')) { 
        if (prop.minimum !== undefined) validators.push(Validators.min(prop.minimum)); 
        if (prop.maximum !== undefined) validators.push(Validators.max(prop.maximum)); 
      } 

      const control = new FormControl(prop.default ?? '', validators); 
      this.form.addControl(key, control); 
    }); 

    this.fieldKeys.set(keys); 

    // Subscribe to changes
    this.form.valueChanges.subscribe(val => { 
      // Emit status 
      this.statusChange.emit(this.form.valid ? 'VALID' : 'INVALID');
      
      if (this.form.valid) { 
        this.formValueChange.emit(this.cleanValues(val)); 
      } 
    }); 
  } 

  /** 
   * Helper to retrieve property definition for template binding. 
   */ 
  getProperty(key: string): JsonSchemaProperty | null { 
    const schema = this.jsonSchema() as JsonSchema; // Safe cast after rebuild
    return schema?.properties?.[key] || null; 
  } 

  hasError(key: string, errorName: string): boolean { 
    return this.form.get(key)?.hasError(errorName) ?? false; 
  } 

  formatLabel(key: string): string { 
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); 
  } 

  /**
   * Sanitizes values before emission (e.g. Date Objects -> strings).
   */
  private cleanValues(raw: Record<string, any>): Record<string, any> { 
    const result = { ...raw }; 
    const schema = this.jsonSchema() as JsonSchema;
    const props = schema.properties || {}; 
    
    Object.keys(result).forEach(key => { 
      const prop = props[key]; 
      const val = result[key]; 
      
      if (prop?.format === 'date' && val instanceof Date) { 
        result[key] = val.toISOString().split('T')[0]; 
      } 
    }); 
    return result; 
  } 
}