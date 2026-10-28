/**
 * @fileoverview Markdown text editor component for configuring and saving TEXT dashboard widgets.
 */
import { Component, input, output, signal, linkedSignal, inject } from '@angular/core';
import { FormRoot, FormField, form, required } from '@angular/forms/signals';
import { DashboardsService, WidgetUpdate } from '../api-client';
import { LOCAL_DRAFT_WIDGET_ID } from '../dashboard/widget-builder/widget-builder.store';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';

/**
 * Editor component for authoring and persisting markdown content in a TEXT widget.
 */
@Component({
  selector: 'app-text-editor',
  imports: [
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
  template: `
    <form [formRoot]="form" (submit)="save()">
      <mat-form-field appearance="outline" class="flex-grow">
        <mat-label i18n>Markdown Content</mat-label>
        <textarea
          matInput
          [formField]="form.content"
          i18n-placeholder
          placeholder="# Header

**Bold Text**

- List Item"
        ></textarea>
        <mat-hint i18n>Supports basic Markdown syntax.</mat-hint>
      </mat-form-field>
    </form>

    <div class="footer">
      <button
        i18n
        type="button"
        mat-flat-button
        (click)="save()"
        [disabled]="form().invalid() || isRunning()"
      >
        @if (isRunning()) {
          <mat-spinner
            diameter="18"
            class="mr-2"
            i18n-aria-label
            aria-label="Saving markdown content"
          ></mat-spinner>
        }
        Save Content
      </button>
    </div>
  `,
})
export class TextEditorComponent {
  /** Backend dashboards API service. */
  private readonly dashboardsApi = inject(DashboardsService);

  /** Parent dashboard ID containing the widget. */
  readonly dashboardId = input<string>('');

  /** Target widget ID being edited. */
  readonly widgetId = input<string>('');

  /** Initial markdown content loaded into the editor. */
  readonly initialContent = input<string>('');

  /** Emits the updated markdown string after a successful save. */
  readonly contentChange = output<string>();

  /** Whether a save request is currently in flight. */
  readonly isRunning = signal(false);

  /** Reactive signal model synchronized with `initialContent`. */
  readonly formModel = linkedSignal(() => ({ content: this.initialContent() }));

  /** Signal-based form instance enforcing required markdown content. */
  readonly form = form(this.formModel, (f) => {
    required(f.content);
  });

  /** Persists the current markdown content to the backend widget configuration. */
  save(): void {
    if (this.form().invalid()) return;

    const val = this.formModel().content;
    if (this.widgetId() === LOCAL_DRAFT_WIDGET_ID) {
      this.contentChange.emit(val);
      return;
    }

    this.isRunning.set(true);

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
