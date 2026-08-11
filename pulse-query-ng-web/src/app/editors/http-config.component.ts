/* v8 ignore start */
/** @docs */
import {
  Component,
  input,
  output,
  inject,
  signal,
  linkedSignal,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormRoot,
  FormField,
  form,
  required,
  pattern,
  applyEach,
  schema,
  validate,
} from '@angular/forms/signals';
import { finalize } from 'rxjs/operators';

import { DashboardsService, ExecutionService, WidgetUpdate } from '../api-client';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

interface KeyValuePair {
  key: string;
  value: string;
}

interface HttpConfigForm {
  method: string;
  url: string;
  forward_auth: boolean;
  body: string;
  params: KeyValuePair[];
  headers: KeyValuePair[];
}

const pairSchema = schema<KeyValuePair>((f) => {
  required(f.key);
  required(f.value);
});

/** @docs */
@Component({
  selector: 'app-http-config',
  imports: [
    CommonModule,
    FormRoot,
    FormField,
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
export class HttpConfigComponent {
  private readonly dashboardsApi = inject(DashboardsService);
  private readonly executionApi = inject(ExecutionService);

  readonly dashboardId = input.required<string>();
  readonly widgetId = input.required<string>();
  readonly initialConfig = input<Record<string, any>>({});
  readonly configChange = output<Record<string, any>>();

  readonly isRunning = signal(false);
  readonly result = signal<any | null>(null);

  readonly formModel = linkedSignal<HttpConfigForm>(() => this.parseConfig(this.initialConfig()));

  readonly form = form(this.formModel, (f) => {
    required(f.method);
    required(f.url);
    pattern(f.url, /^https?:\/\/.+/);
    applyEach(f.params, pairSchema);
    applyEach(f.headers, pairSchema);
    validate(f.body, (ctx) => {
      const value = ctx.value();
      if (!value || value.trim() === '') return null;
      try {
        JSON.parse(value);
        return null;
      } catch (e) {
        return { kind: 'invalidJson', message: 'Invalid JSON format' };
      }
    });
  });

  constructor() {}

  isFieldInvalid(fieldTree: any): boolean {
    return !!(fieldTree().invalid() && (fieldTree().dirty() || fieldTree().touched()));
  }

  private parseConfig(config: Record<string, any>): HttpConfigForm {
    if (!config)
      return { method: 'GET', url: '', forward_auth: false, body: '', params: [], headers: [] };
    let bodyText = '';
    if (config['body']) {
      try {
        bodyText = JSON.stringify(config['body'], null, 2);
      } catch {
        bodyText = String(config['body']);
      }
    }

    const params: KeyValuePair[] = [];
    if (config['params']) {
      Object.entries(config['params']).forEach(([k, v]) => {
        params.push({ key: k, value: String(v) });
      });
    }

    const headers: KeyValuePair[] = [];
    if (config['headers']) {
      Object.entries(config['headers']).forEach(([k, v]) => {
        headers.push({ key: k, value: String(v) });
      });
    }

    return {
      method: config['method'] || 'GET',
      url: config['url'] || '',
      forward_auth: !!config['meta_forward_auth'],
      body: bodyText,
      params,
      headers,
    };
  }

  addItem(type: 'params' | 'headers') {
    this.formModel.update((m) => {
      const target = type === 'params' ? m.params : m.headers;
      return {
        ...m,
        [type]: [...target, { key: '', value: '' }],
      };
    });
  }

  removeItem(type: 'params' | 'headers', index: number) {
    this.formModel.update((m) => {
      const target = type === 'params' ? m.params : m.headers;
      return {
        ...m,
        [type]: target.filter((_, i) => i !== index),
      };
    });
  }

  saveAndTest() {
    if (this.form().invalid()) return;
    this.isRunning.set(true);
    this.result.set(null);

    const f = this.formModel();
    const bodyObj = f.body ? JSON.parse(f.body) : null;

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

  private arrToObj(arr: { key: string; value: string }[]): Record<string, string> {
    const obj: Record<string, string> = {};
    arr.forEach((i) => {
      if (i.key) obj[i.key] = i.value;
    });
    return obj;
  }
}
