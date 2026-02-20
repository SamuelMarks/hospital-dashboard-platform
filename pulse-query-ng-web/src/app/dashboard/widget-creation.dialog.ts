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
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  DashboardsService,
  WidgetIn,
  WidgetUpdate,
  WidgetResponse,
  DashboardResponse,
} from '../api-client';
import { DashboardStore } from './dashboard.store';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { HttpConfigComponent } from '../editors/http-config.component';

export interface WidgetCreationData {
  dashboardId: string;
}

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
  templateUrl: './widget-creation.dialog.html',
  styleUrls: ['./widget-creation.dialog.css'],
})
export class WidgetCreationDialog implements OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<WidgetCreationDialog>);
  private readonly dashboardsApi = inject(DashboardsService);
  private readonly store = inject(DashboardStore);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  readonly data = inject<WidgetCreationData>(MAT_DIALOG_DATA);

  readonly selectedType = signal<'SQL' | 'HTTP' | null>(null);
  readonly selectedViz = signal<string | null>(null);
  readonly isCreatingDraft = signal(false);
  readonly draftWidget = signal<WidgetResponse | null>(null);

  readonly configForm: FormGroup = this.fb.group({
    title: ['', Validators.required],
    xKey: [null],
    yKey: [null],
  });

  readonly supportsMapping = computed(() => {
    return ['bar_chart', 'line_graph', 'pie'].includes(this.selectedViz() || '');
  });
  readonly isPie = computed(() => this.selectedViz() === 'pie');

  readonly availableColumns: Signal<string[]> = computed(() => {
    const widget = this.draftWidget();
    if (!widget) return [];
    const result = this.store.dataMap()[widget.id];
    if (result && Array.isArray(result.columns)) return result.columns as string[];
    return [];
  });

  ngOnDestroy(): void {
    const draft = this.draftWidget();
    if (draft) {
      this.dashboardsApi
        .deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(draft.id)
        .subscribe({ error: (e) => console.warn('Draft cleanup failed', e) });
    }
  }

  setType(type: 'SQL' | 'HTTP'): void {
    this.selectedType.set(type);
  }

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
          this.snackBar.open('Failed to initialize editor', 'Close', { duration: 3000 });
          this.dialogRef.close(false);
        },
      });
  }

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

  cancel(): void {
    this.dialogRef.close(false);
  }

  private formatTitle(viz: string): string {
    return viz
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
