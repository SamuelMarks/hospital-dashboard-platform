/**
 * @fileoverview HTTP Request Builder Component.
 * 
 * Allows configuration of:
 * - Method (GET/POST/etc).
 * - URL.
 * - Headers & Query Parameters (Key-Value Pairs).
 * - JSON Body Payload.
 */

import { Component, input, output, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, FormArray, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms'; 
import { finalize } from 'rxjs/operators'; 

// Material
import { MatFormFieldModule } from '@angular/material/form-field'; 
import { MatInputModule } from '@angular/material/input'; 
import { MatSelectModule } from '@angular/material/select'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatSlideToggleModule } from '@angular/material/slide-toggle'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatExpansionModule } from '@angular/material/expansion'; 
import { MatDividerModule } from '@angular/material/divider'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 

import { DashboardsService, ExecutionService, WidgetUpdate } from '../api-client'; 

interface KeyValuePair { key: string; value: string; } 

/**
 * Strict Typed Form Interface for HTTP Config.
 */
interface HttpConfigForm {
  method: FormControl<string>;
  url: FormControl<string>;
  forward_auth: FormControl<boolean>;
  body: FormControl<string | null>;
  params: FormArray<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>;
  headers: FormArray<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>;
}

/** 
 * Validator to ensure valid JSON syntax in text fields.
 */
export function jsonValidator(): ValidatorFn { 
  return (control: AbstractControl): ValidationErrors | null => { 
    const value = control.value; 
    if (!value || value.trim() === '') return null; 
    try { 
      JSON.parse(value); 
      return null; 
    } catch (e) { 
      return { invalidJson: true }; 
    } 
  }; 
} 

/** 
 * Editor for HTTP-based Widgets. 
 * 
 * **Updates:**
 * - Fully typed `FormGroup<HttpConfigForm>`.
 * - Accessibility improvements via semantic grouping and labels.
 */ 
@Component({ 
  selector: 'app-http-config', 
  // 'standalone: true' removed (default).
  imports: [ 
    CommonModule, 
    ReactiveFormsModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatSelectModule, 
    MatButtonModule, 
    MatSlideToggleModule, 
    MatIconModule, 
    MatExpansionModule, 
    MatDividerModule, 
    MatProgressSpinnerModule
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; } 
    .main-layout { flex: 1; display: flex; overflow: hidden; } 
    .config-panel { 
      flex: 1; overflow-y: auto; padding: 16px; 
      display: flex; flex-direction: column; gap: 16px; 
      background-color: var(--sys-surface); 
    } 
    .preview-panel { 
      flex: 1; background-color: var(--sys-background); 
      border-left: 1px solid var(--sys-surface-border); 
      display: flex; flex-direction: column; 
    } 
    .preview-header { 
      padding: 8px 16px; background-color: var(--sys-background); 
      font-size: 11px; font-weight: 700; text-transform: uppercase; 
      color: var(--sys-text-secondary); border-bottom: 1px solid var(--sys-surface-border); 
    } 
    .json-code { 
      flex: 1; padding: 16px; font-family: monospace; font-size: 12px; 
      overflow: auto; white-space: pre-wrap; word-break: break-all; 
      color: var(--sys-text-primary); 
    } 
    .array-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; } 
    .header-bar { 
      padding: 8px 16px; background-color: var(--sys-surface); 
      border-bottom: 1px solid var(--sys-surface-border); 
      display: flex; justify-content: space-between; align-items: center; 
    } 
    .header-title { font-size: 0.875rem; font-weight: 500; color: var(--sys-text-primary); } 
  `], 
  template: `
    <!-- Toolbar -->
    <div class="header-bar">
      <h3 class="header-title">HTTP Configuration</h3>
      <button 
        mat-flat-button 
        color="primary" 
        (click)="saveAndTest()" 
        [disabled]="form.invalid || isRunning()" 
      >
        @if (isRunning()) { <mat-spinner diameter="18" class="mr-2"></mat-spinner> } 
        Save & Test
      </button>
    </div>

    <div class="main-layout">
      <!-- Form Area -->
      <div class="config-panel">
        <form [formGroup]="form">
          
          <div class="flex gap-4">
            <mat-form-field appearance="outline" class="w-32">
              <mat-label>Method</mat-label>
              <mat-select formControlName="method">
                <mat-option value="GET">GET</mat-option>
                <mat-option value="POST">POST</mat-option>
                <mat-option value="PUT">PUT</mat-option>
                <mat-option value="DELETE">DELETE</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="flex-grow">
              <mat-label>URL Endpoint</mat-label>
              <input matInput formControlName="url" placeholder="https://api.example.com">
              <mat-error *ngIf="form.get('url')?.invalid">Valid URL is required</mat-error>
            </mat-form-field>
          </div>

          <div class="mb-4">
            <mat-slide-toggle formControlName="forward_auth" color="primary">
              Forward Authentication Token
            </mat-slide-toggle>
            <p class="text-xs mt-1 ml-10" style="color: var(--sys-text-secondary)">Passes the current user's JWT to the external service.</p>
          </div>

          <mat-accordion multi>
            
            <!-- Params -->
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>Query Parameters</mat-panel-title>
              </mat-expansion-panel-header>
              
              <div formArrayName="params">
                @for (item of paramsArray.controls; track item; let i = $index) { 
                  <div [formGroupName]="i" class="array-row">
                    <mat-form-field appearance="outline" class="flex-1" subscriptSizing="dynamic">
                      <input matInput formControlName="key" placeholder="Key" aria-label="Parameter Key">
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="flex-1" subscriptSizing="dynamic">
                      <input matInput formControlName="value" placeholder="Value" aria-label="Parameter Value">
                    </mat-form-field>
                    <button mat-icon-button color="warn" (click)="removeItem('params', i)" aria-label="Remove Parameter">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </div>
                } 
              </div>
              <button mat-button color="primary" (click)="addItem('params')">
                <mat-icon>add</mat-icon> Add Parameter
              </button>
            </mat-expansion-panel>

            <!-- Headers -->
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>Headers</mat-panel-title>
              </mat-expansion-panel-header>

              <div formArrayName="headers">
                @for (item of headersArray.controls; track item; let i = $index) { 
                  <div [formGroupName]="i" class="array-row">
                    <mat-form-field appearance="outline" class="flex-1" subscriptSizing="dynamic">
                      <input matInput formControlName="key" placeholder="Header Key" aria-label="Header Key">
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="flex-1" subscriptSizing="dynamic">
                      <input matInput formControlName="value" placeholder="Value" aria-label="Header Value">
                    </mat-form-field>
                    <button mat-icon-button color="warn" (click)="removeItem('headers', i)" aria-label="Remove Header">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </div>
                } 
              </div>
              <button mat-button color="primary" (click)="addItem('headers')">
                <mat-icon>add</mat-icon> Add Header
              </button>
            </mat-expansion-panel>

            <!-- Body -->
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>Request Body (JSON)</mat-panel-title>
              </mat-expansion-panel-header>
              
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>JSON Payload</mat-label>
                <textarea 
                  matInput 
                  formControlName="body" 
                  rows="8" 
                  class="font-mono" 
                  placeholder='{ "key": "value" }' 
                ></textarea>
                <mat-error *ngIf="form.hasError('invalidJson', 'body')">Invalid JSON format</mat-error>
              </mat-form-field>
            </mat-expansion-panel>

          </mat-accordion>
        </form>
      </div>

      <!-- Result Area -->
      <div class="preview-panel">
        <div class="preview-header">Response Preview</div>
        <div class="json-code">
          @if (result(); as res) { 
            {{ res | json }} 
          } @else { 
            <span style="color: var(--sys-text-secondary)">Save and Test to see response...</span>
          } 
        </div>
      </div>
    </div>
  `
}) 
export class HttpConfigComponent implements OnInit { 
  private readonly fb = inject(FormBuilder); 
  private readonly dashboardsApi = inject(DashboardsService); 
  private readonly executionApi = inject(ExecutionService); 

  readonly dashboardId = input.required<string>(); 
  readonly widgetId = input.required<string>(); 
  readonly initialConfig = input<Record<string, any>>({}); 
  readonly configChange = output<Record<string, any>>(); 

  readonly isRunning = signal(false); 
  readonly result = signal<any | null>(null); 

  // Strictly Typed Form Group
  readonly form: FormGroup<HttpConfigForm> = this.fb.group({ 
    method: new FormControl('GET', { validators: [Validators.required], nonNullable: true }), 
    url: new FormControl('', { validators: [Validators.required, Validators.pattern(/^https?:\/\/.+/)], nonNullable: true }), 
    forward_auth: new FormControl(false, { nonNullable: true }), 
    body: new FormControl('', { validators: [jsonValidator()] }), 
    params: this.fb.array(new Array<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>()), 
    headers: this.fb.array(new Array<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>()) 
  }); 

  get paramsArray() { return this.form.get('params') as FormArray; } 
  get headersArray() { return this.form.get('headers') as FormArray; } 

  ngOnInit(): void { 
    this.hydrateForm(this.initialConfig()); 
  } 

  isFieldInvalid(fieldName: string): boolean { 
    const field = this.form.get(fieldName as keyof HttpConfigForm); 
    return !!(field && field.invalid && (field.dirty || field.touched)); 
  } 

  private hydrateForm(config: Record<string, any>): void { 
    if (!config) return; 
    let bodyText = ''; 
    if (config['body']) { 
      try { bodyText = JSON.stringify(config['body'], null, 2); } 
      catch { bodyText = String(config['body']); } 
    } 
    this.form.patchValue({ 
      method: config['method'] || 'GET', 
      url: config['url'] || '', 
      forward_auth: !!config['meta_forward_auth'], 
      body: bodyText
    }); 
    this.populateArray(this.paramsArray, config['params']); 
    this.populateArray(this.headersArray, config['headers']); 
  } 

  private populateArray(array: FormArray, source: Record<string, string> | undefined): void { 
    array.clear(); 
    if (source) { 
      Object.entries(source).forEach(([k, v]) => array.push(this.createPair(k, v))); 
    } 
  } 

  createPair(key = '', value = ''): FormGroup { 
    return this.fb.group({ 
      key: new FormControl(key, { validators: [Validators.required], nonNullable: true }), 
      value: new FormControl(value, { validators: [Validators.required], nonNullable: true }) 
    }); 
  } 

  addItem(type: 'params' | 'headers') { 
    const target = type === 'params' ? this.paramsArray : this.headersArray; 
    target.push(this.createPair()); 
  } 

  removeItem(type: 'params' | 'headers', index: number) { 
    const target = type === 'params' ? this.paramsArray : this.headersArray; 
    target.removeAt(index); 
  } 

  saveAndTest() { 
    if (this.form.invalid) return; 
    this.isRunning.set(true); 
    this.result.set(null); 

    const f = this.form.getRawValue(); 
    const bodyObj = f.body ? JSON.parse(f.body) : null; 
    
    // Explicit Partial Update Payload logic
    const newConfig = { 
      method: f.method, 
      url: f.url, 
      params: this.arrToObj(f.params), 
      headers: this.arrToObj(f.headers), 
      body: bodyObj, 
      meta_forward_auth: f.forward_auth
    }; 

    const update: WidgetUpdate = { config: newConfig }; 
    this.dashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widgetId(), update) 
      .subscribe({ 
        next: () => { 
          this.executeTestRun(); 
          this.configChange.emit(newConfig); 
        }, 
        error: (err) => { 
          this.isRunning.set(false); 
          this.result.set({ error: 'Save failed', detail: err }); 
        } 
      }); 
  } 

  private executeTestRun() { 
    this.executionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost(this.dashboardId()) 
      .pipe(finalize(() => this.isRunning.set(false))) 
      .subscribe({ 
        next: (map) => this.result.set(map[this.widgetId()] || { info: 'No Data returned for this widget ID' }), 
        error: (err) => this.result.set({ error: 'Run failed', detail: err }) 
      }); 
  } 

  private arrToObj(arr: Array<{key: string, value: string}>): Record<string, string> { 
    const obj: Record<string, string> = {}; 
    arr.forEach(i => { if (i.key) obj[i.key] = i.value; }); 
    return obj; 
  } 
}