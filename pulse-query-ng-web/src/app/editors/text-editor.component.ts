/**
 * @fileoverview Text Editor Component for Static Markdown Widget.
 */

import {
  Component,
  input,
  output,
  signal,
  inject,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  FormControl,
} from '@angular/forms';
import { DashboardsService, WidgetUpdate } from '../api-client';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';

/**
 * Editor to input Markdown Content.
 */
@Component({
  selector: 'app-text-editor',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
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
export class TextEditorComponent implements OnInit {
  /** fb property. */
  private readonly fb = inject(FormBuilder);
  /** dashboardsApi property. */
  private readonly dashboardsApi = inject(DashboardsService);

  /** Dashboard Id. */
  /* istanbul ignore next */
  readonly dashboardId = input.required<string>();
  /** Widget Id. */
  /* istanbul ignore next */
  readonly widgetId = input.required<string>();
  /** Initial Content. */
  /* istanbul ignore next */
  readonly initialContent = input<string>('');

  /** Content Change. */
  readonly contentChange = output<string>();

  /** Whether running. */
  /* istanbul ignore next */
  readonly isRunning = signal(false);

  /** Form. */
  readonly form = this.fb.group({
    content: ['', Validators.required],
  });

  /** Ng On Init. */
  ngOnInit() {
    this.form.patchValue({ content: this.initialContent() });
  }

  /** Save. */
  save() {
    if (this.form.invalid) return;

    this.isRunning.set(true);
    const val = this.form.value.content || '';

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
