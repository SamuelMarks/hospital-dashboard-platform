/* v8 ignore start */
/** @docs */
/**
 * @fileoverview HTTP Request Builder Component.
 *
 * Allows configuration of:
 * - Method (GET/POST/etc).
 * - URL.
 * - Headers & Query Parameters (Key-Value Pairs).
 * - JSON Body Payload.
 */

import {
  Component,
  input,
  output,
  inject,
  signal,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormControl,
  FormArray,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
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

/** Key Value Pair interface. */
interface KeyValuePair {
  /** Key. */
  key: string;
  /** Value. */
  value: string;
}

/**
 * Strict Typed Form Interface for HTTP Config.
 */
interface HttpConfigForm {
  /** Method. */
  method: FormControl<string>;
  /** Url. */
  url: FormControl<string>;
  /** Forward Auth. */
  forward_auth: FormControl<boolean>;
  /** Body. */
  body: FormControl<string | null>;
  /** Params. */
  params: FormArray<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>;
  /** Headers. */
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
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .main-layout {
        flex: 1;
        display: flex;
        overflow: hidden;
      }
      .config-panel {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        background-color: var(--sys-surface);
      }
      .preview-panel {
        flex: 1;
        background-color: var(--sys-background);
        border-left: 1px solid var(--sys-surface-border);
        display: flex;
        flex-direction: column;
      }
      .preview-header {
        padding: 8px 16px;
        background-color: var(--sys-background);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
        border-bottom: 1px solid var(--sys-surface-border);
      }
      .json-code {
        flex: 1;
        padding: 16px;
        font-family: monospace;
        font-size: 12px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-all;
        color: var(--sys-text-primary);
      }
      .array-row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
      }
      .header-bar {
        padding: 8px 16px;
        background-color: var(--sys-surface);
        border-bottom: 1px solid var(--sys-surface-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .header-title {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--sys-text-primary);
      }
    `,
  ],
  templateUrl: './http-config.component.html',
})
/** @docs */
export class HttpConfigComponent {
  /** fb property. */
  private readonly fb = inject(FormBuilder);
  /** dashboardsApi property. */
  private readonly dashboardsApi = inject(DashboardsService);
  /** executionApi property. */
  private readonly executionApi = inject(ExecutionService);

  /** Dashboard Id. */
  /* istanbul ignore next */
  readonly dashboardId = input.required<string>();
  /** Widget Id. */
  /* istanbul ignore next */
  readonly widgetId = input.required<string>();
  /** Initial Config. */
  /* istanbul ignore next */
  readonly initialConfig = input<Record<string, any>>({});
  /** Config Change. */
  readonly configChange = output<Record<string, any>>();

  /** Whether running. */
  /* istanbul ignore next */
  readonly isRunning = signal(false);
  /** Result. */
  /* istanbul ignore next */
  readonly result = signal<any | null>(null);

  // Strictly Typed Form Group
  /** Form. */
  readonly form: FormGroup<HttpConfigForm> = this.fb.group({
    method: new FormControl('GET', { validators: [Validators.required], nonNullable: true }),
    url: new FormControl('', {
      validators: [Validators.required, Validators.pattern(/^https?:\/\/.+/)],
      nonNullable: true,
    }),
    forward_auth: new FormControl(false, { nonNullable: true }),
    body: new FormControl('', { validators: [jsonValidator()] }),
    params: this.fb.array(
      new Array<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>(),
    ),
    headers: this.fb.array(
      new Array<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>(),
    ),
  });

  /** Params Array. */
  get paramsArray() {
    return this.form.get('params') as FormArray;
  }
  /** Headers Array. */
  get headersArray() {
    return this.form.get('headers') as FormArray;
  }

  /** Creates a new HttpConfigComponent. */
  constructor() {
    effect(() => this.hydrateForm(this.initialConfig()));
  }

  /** Whether field Invalid. */
  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName as keyof HttpConfigForm);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /** hydrateForm method. */
  private hydrateForm(config: Record<string, any>): void {
    if (!config) return;
    let bodyText = '';
    if (config['body']) {
      try {
        bodyText = JSON.stringify(config['body'], null, 2);
      } catch {
        bodyText = String(config['body']);
      }
    }
    this.form.patchValue({
      method: config['method'] || 'GET',
      url: config['url'] || '',
      forward_auth: !!config['meta_forward_auth'],
      body: bodyText,
    });
    this.populateArray(this.paramsArray, config['params']);
    this.populateArray(this.headersArray, config['headers']);
  }

  /** populateArray method. */
  private populateArray(array: FormArray, source: Record<string, string> | undefined): void {
    array.clear();
    if (source) {
      Object.entries(source).forEach(([k, v]) => array.push(this.createPair(k, v)));
    }
  }

  /** Creates pair. */
  createPair(key = '', value = ''): FormGroup {
    return this.fb.group({
      key: new FormControl(key, { validators: [Validators.required], nonNullable: true }),
      value: new FormControl(value, { validators: [Validators.required], nonNullable: true }),
    });
  }

  /** Adds item. */
  addItem(type: 'params' | 'headers') {
    const target = type === 'params' ? this.paramsArray : this.headersArray;
    target.push(this.createPair());
  }

  /** Removes item. */
  removeItem(type: 'params' | 'headers', index: number) {
    const target = type === 'params' ? this.paramsArray : this.headersArray;
    target.removeAt(index);
  }

  /** Save And Test. */
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
      meta_forward_auth: f.forward_auth,
    };

    const update: WidgetUpdate = { config: newConfig };
    this.dashboardsApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widgetId(), update)
      .subscribe({
        next: () => {
          this.executeTestRun();
          this.configChange.emit(newConfig);
        },
        error: (err) => {
          this.isRunning.set(false);
          this.result.set({ error: 'Save failed', detail: err });
        },
      });
  }

  /** executeTestRun method. */
  private executeTestRun() {
    this.executionApi
      .refreshDashboardApiV1DashboardsDashboardIdRefreshPost(this.dashboardId())
      .pipe(finalize(() => this.isRunning.set(false)))
      .subscribe({
        next: (map) =>
          this.result.set(map[this.widgetId()] || { info: 'No Data returned for this widget ID' }),
        error: (err) => this.result.set({ error: 'Run failed', detail: err }),
      });
  }

  /** arrToObj method. */
  private arrToObj(arr: Array<{ key: string; value: string }>): Record<string, string> {
    const obj: Record<string, string> = {};
    arr.forEach((i) => {
      if (i.key) obj[i.key] = i.value;
    });
    return obj;
  }
}
