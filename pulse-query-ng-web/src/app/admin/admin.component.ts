/**
 * @fileoverview Administrative configuration component for managing LLM API keys,
 * model visibility, and database/dataset diagnostics.
 */
import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { form, FormRoot, FormField } from '@angular/forms/signals';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { AdminService, AiService, ModelInfo } from '../api-client';
import { ConnectionStatusService } from '../core/health/connection-status.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

/**
 * Component providing the administration interface for API keys, model selection, and system diagnostics.
 */
@Component({
  selector: 'app-admin',
  imports: [
    FormRoot,
    FormField,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  templateUrl: './admin.component.html',
  styles: [
    `
      .admin-container {
        padding: 20px;
        max-width: 640px;
        margin: 0 auto;
        color: var(--sys-on-surface);
      }
      .section {
        margin-bottom: 1.5rem;
        padding: 1.25rem;
        border: 1px solid var(--sys-surface-border);
        background-color: var(--sys-surface);
        border-radius: 8px;
        display: block;
      }
      .key-item {
        margin-bottom: 0.75rem;
        display: flex;
        flex-direction: column;
      }
      .full-width-field {
        width: 100%;
      }
      .model-item {
        margin-bottom: 0.5rem;
      }
      .diag-actions {
        margin-top: 1rem;
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .message {
        margin-top: 1rem;
        color: var(--sys-on-primary-container);
        background-color: var(--sys-primary-container);
        border: 1px solid var(--sys-primary);
        padding: 1rem;
        border-radius: 4px;
        font-weight: 600;
      }
      .loading {
        padding: 20px;
        text-align: center;
        color: var(--sys-text-secondary);
      }
      h2,
      h3 {
        color: var(--sys-on-surface);
        margin-top: 0;
      }
      p {
        color: var(--sys-text-secondary);
      }
    `,
  ],
})
export class AdminComponent implements OnInit {
  /** Backend administration API service. */
  private adminService = inject(AdminService);
  /** AI model management API service. */
  private aiService = inject(AiService);
  /** Destroy reference for cleaning up subscriptions and timers. */
  private destroyRef = inject(DestroyRef);
  /** Service monitoring backend and database health statuses. */
  private connectionService = inject(ConnectionStatusService);

  /** Whether the initial admin settings have finished loading. */
  settingsLoaded = signal<boolean>(false);
  /** List of all available LLM models from the backend. */
  availableModels = signal<ModelInfo[]>([]);
  /** Status or feedback message displayed to the administrator. */
  message = signal<string>('');
  /** Whether a settings save operation is currently in progress. */
  isSaving = signal<boolean>(false);

  /** Reactive signal model backing the admin settings form. */
  formModel = signal({
    openai: '',
    anthropic: '',
    models: [] as boolean[],
  });

  /** Signal-based form instance bound to `formModel`. */
  adminForm = form(this.formModel);

  /** Computed signal returning the current PostgreSQL connection status label. */
  readonly pgStatus = computed(
    () => this.connectionService.healthData()?.postgres?.status || $localize`Unknown`,
  );

  /** Computed signal returning the current DuckDB OLAP engine status label. */
  readonly duckStatus = computed(
    () => this.connectionService.healthData()?.duckdb?.status || $localize`Unknown`,
  );

  /** Computed signal returning a human-readable description of the hospital dataset status. */
  readonly dataStatusText = computed(() => {
    const data = this.connectionService.healthData()?.data;
    if (!data) return $localize`Checking...`;
    return data.has_default_data
      ? $localize`Default CSV Present`
      : $localize`Synthetic Fallback Active`;
  });

  /** Opens the system connection diagnostics modal dialog. */
  openDiagnostics(): void {
    this.connectionService.openDiagnosticsDialog();
  }

  /** Triggers a re-ingestion of the hospital CSV datasets on the backend. */
  reingestData(): void {
    this.connectionService.triggerReingest().subscribe({
      next: (res) => {
        this.message.set(res.message || $localize`Data re-ingested successfully!`);
        const timer = setTimeout(() => this.message.set(''), 3000);
        this.destroyRef.onDestroy(() => clearTimeout(timer));
      },
      error: () => {
        this.message.set($localize`Failed to re-ingest CSV data.`);
        const timer = setTimeout(() => this.message.set(''), 3000);
        this.destroyRef.onDestroy(() => clearTimeout(timer));
      },
    });
  }

  /** Loads current admin settings and available models on component initialization. */
  ngOnInit(): void {
    forkJoin({
      settings: this.adminService.readAdminSettingsApiV1AdminSettingsGet(),
      models: this.aiService.listAvailableModelsApiV1AiModelsGet(true),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ settings, models }) => {
        this.availableModels.set(models);

        this.formModel.set({
          openai: settings.api_keys?.['openai'] || '',
          anthropic: settings.api_keys?.['anthropic'] || '',
          models: models.map((model) => settings.visible_models.includes(model.id)),
        });

        this.settingsLoaded.set(true);
      });
  }

  /** Persists the updated API keys and visible model selections. */
  saveSettings(): void {
    this.isSaving.set(true);

    const formValue = this.formModel();
    const finalKeys: Record<string, string> = {};

    if (formValue.openai.trim()) {
      finalKeys['openai'] = formValue.openai.trim();
    }
    if (formValue.anthropic.trim()) {
      finalKeys['anthropic'] = formValue.anthropic.trim();
    }

    const selectedModels = this.availableModels()
      .filter((_, index) => formValue.models[index])
      .map((model) => model.id);

    this.adminService
      .writeAdminSettingsApiV1AdminSettingsPut({
        api_keys: finalKeys,
        visible_models: selectedModels,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.message.set($localize`Settings saved successfully!`);
          this.isSaving.set(false);
          const timer = setTimeout(() => this.message.set(''), 3000);
          this.destroyRef.onDestroy(() => clearTimeout(timer));
        },
        error: () => {
          this.isSaving.set(false);
          this.message.set($localize`Error saving settings.`);
        },
      });
  }
}
