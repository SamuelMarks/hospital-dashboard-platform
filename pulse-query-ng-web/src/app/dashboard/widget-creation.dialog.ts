import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnDestroy,
  computed,
  Signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  Validators,
  FormGroup,
} from '@angular/forms';

// Material Imports
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// App Imports
import {
  DashboardsService,
  WidgetIn,
  WidgetCreateSql, // Import subtype
  WidgetCreateHttp, // Import subtype
  WidgetUpdate,
  WidgetResponse,
  DashboardResponse,
} from '../api-client';
import { DashboardStore } from './dashboard.store';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { HttpConfigComponent } from '../editors/http-config.component';

/** Widget Creation Data interface. */
export interface WidgetCreationData {
  /** dashboardId property. */
  dashboardId: string;
}

/**
 * Widget Creation Wizard Dialog.
 *
 * Orchestrates the multi-step process of creating a new widget.
 */
@Component({
  selector: 'app-widget-creation-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    SqlBuilderComponent,
    HttpConfigComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      /* Host resets */
      :host {
        display: block;
        width: 100%;
      }

      /* Remove default material padding/height constraints */
      mat-dialog-content {
        padding: 0 !important;
        margin: 0 !important;
        max-height: 90vh;
        display: block;
      }

      /* Steps 1 & 2: Shrink-wrap layout */
      .compact-step-wrapper {
        padding: 24px;
      }

      /* Spacing control: Exactly 7px top margin for actions */
      .step-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 7px;
      }
      .step-actions.end {
        justify-content: flex-end;
      }

      /* Config Step Layout */
      .config-layout {
        display: flex;
        flex-direction: column;
        height: 70vh;
        overflow: hidden;
      }

      .config-header {
        padding: 16px 24px;
        /* Fix: Use semantic surface color (Dark in Dark Mode) */
        background-color: var(--sys-background);
        border-bottom: 1px solid var(--sys-surface-border);
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
        flex-shrink: 0;
      }

      .editor-container {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        position: relative;
        background-color: var(--sys-surface);
      }

      .actions-footer {
        padding: 12px 16px;
        border-top: 1px solid var(--sys-surface-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        /* Fix: Ensure footer background matches theme */
        background-color: var(--sys-surface);
        flex-shrink: 0;
        z-index: 10;
      }

      /* -- Option Cards (Data Source) -- */
      .option-card {
        border: 1px solid var(--sys-surface-border);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 16px;
        background-color: var(--sys-surface);
        color: var(--sys-text-primary);
      }
      /* Hover: Use system hover opacity */
      .option-card:hover {
        background-color: var(--sys-hover);
      }
      /* Selected: Use system selected tint and primary border */
      .option-card.selected {
        border-color: var(--sys-primary);
        background-color: var(--sys-selected);
      }

      /* -- Viz Grid (Step 2) -- */
      .viz-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .viz-item {
        border: 1px solid var(--sys-surface-border);
        border-radius: 8px;
        padding: 16px;
        text-align: center;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        background-color: var(--sys-surface);
        color: var(--sys-text-primary);
        transition: all 0.2s;
      }
      .viz-item:hover {
        background-color: var(--sys-hover);
      }
      .viz-item.selected {
        border-color: var(--sys-primary);
        background-color: var(--sys-selected);
        color: var(--sys-primary);
      }

      /* Helpers */
      .text-sm {
        font-size: 0.875rem;
        line-height: 1.25rem;
      }
      .font-medium {
        font-weight: 500;
      }
      .text-xs {
        font-size: 0.75rem;
        line-height: 1rem;
      }
      .text-gray-500 {
        color: var(--sys-text-secondary);
      }
      .mb-4 {
        margin-bottom: 1rem;
      }
      .flex-grow {
        flex-grow: 1;
      }

      @media (max-width: 600px) {
        .config-header {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  templateUrl: './widget-creation.dialog.html',
})
export class WidgetCreationDialog implements OnDestroy {
  /** dialogRef property. */
  private readonly dialogRef = inject(MatDialogRef<WidgetCreationDialog>);
  /** dashboardsApi property. */
  private readonly dashboardsApi = inject(DashboardsService);
  /** store property. */
  private readonly store = inject(DashboardStore);
  /** fb property. */
  private readonly fb = inject(FormBuilder);

  /** Data. */
  readonly data = inject<WidgetCreationData>(MAT_DIALOG_DATA);

  /** Selected Type. */
  readonly selectedType = signal<'SQL' | 'HTTP' | null>(null);
  /** Selected Viz. */
  readonly selectedViz = signal<string | null>(null);
  /** Whether creating Draft. */
  readonly isCreatingDraft = signal(false);
  /** Draft Widget. */
  readonly draftWidget = signal<WidgetResponse | null>(null);

  /** Config Form. */
  readonly configForm: FormGroup = this.fb.group({
    title: ['', Validators.required],
    xKey: [null],
    yKey: [null],
  });

  /** Supports Mapping. */
  readonly supportsMapping = computed(() => {
    return ['bar_chart', 'line_graph', 'pie'].includes(this.selectedViz() || '');
  });
  /** Whether pie. */
  readonly isPie = computed(() => this.selectedViz() === 'pie');

  /** Available Columns. */
  readonly availableColumns: Signal<string[]> = computed(() => {
    const widget = this.draftWidget();
    if (!widget) return [];
    const result = this.store.dataMap()[widget.id];
    if (result && Array.isArray(result.columns)) return result.columns as string[];
    return [];
  });

  /** Ng On Destroy. */
  ngOnDestroy(): void {
    const draft = this.draftWidget();
    if (draft) {
      this.dashboardsApi
        .deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(draft.id)
        .subscribe({ error: (e) => console.warn('Draft cleanup failed', e) });
    }
  }

  /** Sets type. */
  setType(type: 'SQL' | 'HTTP'): void {
    this.selectedType.set(type);
  }

  /** Creates draft Widget. */
  createDraftWidget(): void {
    if (this.draftWidget() || this.isCreatingDraft()) return;

    this.isCreatingDraft.set(true);
    const viz = this.selectedViz()!;
    const type = this.selectedType()!;

    let payload: WidgetIn;

    if (type === 'SQL') {
      const config = { query: 'SELECT * FROM hospital_data LIMIT 5' };
      payload = {
        title: 'New Widget (Draft)',
        type: 'SQL',
        visualization: viz,
        config: config as any,
      };
    } else {
      const config = { url: 'https://jsonplaceholder.typicode.com/todos/1', method: 'GET' };
      payload = {
        title: 'New Widget (Draft)',
        type: 'HTTP',
        visualization: viz,
        config: config as any,
      };
    }

    this.dashboardsApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(this.data.dashboardId, payload)
      .subscribe({
        next: (widget) => {
          this.draftWidget.set(widget);
          this.isCreatingDraft.set(false);
          this.configForm.patchValue({ title: `New ${this.formatTitle(viz)}` });
          this.store.refreshWidget(widget.id);
        },
        error: (err) => {
          console.error(err);
          alert('Failed to initialize editor');
          this.dialogRef.close(false);
        },
      });
  }

  /** Finalize Widget. */
  finalizeWidget(): void {
    const draft = this.draftWidget();
    if (!draft || this.configForm.invalid) return;

    this.dashboardsApi
      .getDashboardApiV1DashboardsDashboardIdGet(this.data.dashboardId)
      .subscribe((dash: DashboardResponse) => {
        const fresh = dash.widgets?.find((w: WidgetResponse) => w.id === draft.id);
        if (!fresh) return;

        const updatedConfig = { ...fresh.config };
        if (this.supportsMapping()) {
          updatedConfig['xKey'] = this.configForm.value.xKey;
          updatedConfig['yKey'] = this.configForm.value.yKey;
        }

        const update: WidgetUpdate = {
          title: this.configForm.value.title!,
          config: updatedConfig,
        };

        this.dashboardsApi
          .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(draft.id, update)
          .subscribe(() => {
            this.draftWidget.set(null);
            this.dialogRef.close(true);
          });
      });
  }

  /** Whether cel. */
  cancel(): void {
    this.dialogRef.close(false);
  }

  /** formatTitle method. */
  private formatTitle(viz: string): string {
    return viz
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
