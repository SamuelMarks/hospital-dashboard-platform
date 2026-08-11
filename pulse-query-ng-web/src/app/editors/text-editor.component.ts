/* v8 ignore start */
/** @docs */
// pulse-query-ng-web/src/app/editors/text-editor.component.ts
import { Component, input, output, signal, linkedSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormRoot, FormField, form, required } from '@angular/forms/signals';
import { DashboardsService, WidgetUpdate } from '../api-client';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';

/** @docs */
@Component({
  selector: 'app-text-editor',
  imports: [
    CommonModule,
    FormRoot,
    FormField,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],

  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      form {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 16px;
        gap: 16px;
        min-height: 0;
      }
      mat-form-field {
        flex: 1;
        width: 100%;
        min-height: 0;
      }
      textarea {
        font-family: monospace;
        resize: none;
        height: 100% !important;
        min-height: 200px;
      }
      .footer {
        display: flex;
        justify-content: flex-end;
        padding: 8px 16px;
        border-top: 1px solid var(--sys-surface-border);
      }
    `,
  ],
  templateUrl: './text-editor.component.html',
})
/** @docs */
export class TextEditorComponent {
  private readonly dashboardsApi = inject(DashboardsService);

  /* v8 ignore next */
  readonly dashboardId = input.required<string>();
  /* v8 ignore next */
  readonly widgetId = input.required<string>();
  /* v8 ignore next */
  readonly initialContent = input<string>('');

  readonly contentChange = output<string>();
  /* v8 ignore next */
  readonly isRunning = signal(false);

  readonly formModel = linkedSignal(() => ({ content: this.initialContent() }));

  readonly form = form(this.formModel, (f) => {
    required(f.content);
  });

  save() {
    if (this.form().invalid()) return;

    this.isRunning.set(true);
    const val = this.formModel().content || '';

    const update: WidgetUpdate = {
      config: { content: val },
    };

    this.dashboardsApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widgetId(), update)
      .pipe(finalize(() => this.isRunning.set(false)))
      .subscribe({
        next: () => this.contentChange.emit(val),
        error: (err) => console.error('Failed to save text widget', err),
      });
  }
}
