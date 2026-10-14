/**
 * @fileoverview Administrative configuration component for managing LLM API keys,
 * model visibility, and database/dataset diagnostics.
 */
import { Component, OnInit, inject, signal, DestroyRef } from '@angular/core';
import { form, FormRoot, FormField } from '@angular/forms/signals';
import { AdminService, AiService, ModelInfo } from '../api-client';
import { ConnectionStatusService } from '../core/health/connection-status.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

/**
 * Component providing the administration interface for API keys, model selection, and system diagnostics.
 */
@Component({
  selector: 'app-admin',
  imports: [FormRoot, FormField],

  template: `
    @if (settingsLoaded()) {
      <div class="admin-container">
        <h2 i18n>Admin Configuration</h2>

        <form [formRoot]="adminForm" (submit)="saveSettings()">
          <div class="section">
            <h3 i18n>API Keys</h3>
            <div class="key-item">
              <label i18n for="openai-key">OpenAI API Key</label>
              <input
                id="openai-key"
                type="password"
                [formField]="adminForm.openai"
                placeholder="sk-..."
                i18n-placeholder
                autocomplete="off"
              />
            </div>
            <div class="key-item">
              <label i18n for="anthropic-key">Anthropic API Key</label>
              <input
                id="anthropic-key"
                type="password"
                [formField]="adminForm.anthropic"
                placeholder="sk-..."
                i18n-placeholder
                autocomplete="off"
              />
            </div>
          </div>

          <div class="section">
            <h3 i18n id="visible-models-title">Visible Models</h3>
            <p i18n id="visible-models-desc">
              Select which models are shown to users in the Ad-hoc query interface.
            </p>
            <fieldset aria-labelledby="visible-models-title" aria-describedby="visible-models-desc">
              <legend i18n class="sr-only">Available Models</legend>
              <div>
                @for (modelVal of adminForm.models; track trackByFn($index)) {
                  <div class="model-item">
                    <label [for]="'model-' + $index">
                      <input [id]="'model-' + $index" type="checkbox" [formField]="modelVal" />
                      {{ availableModels()[$index]?.name }} ({{ availableModels()[$index]?.id }})
                    </label>
                  </div>
                }
              </div>
            </fieldset>
          </div>

          <div class="section">
            <h3 i18n>Database &amp; Analytics Diagnostics</h3>
            <p i18n>
              Live operational status of PostgreSQL, DuckDB, and ingested hospital datasets.
            </p>
            <div class="diag-summary">
              <div class="diag-item" i18n><strong>PostgreSQL:</strong> {{ pgStatus() }}</div>
              <div class="diag-item" i18n><strong>DuckDB OLAP:</strong> {{ duckStatus() }}</div>
              <div class="diag-item" i18n>
                <strong>Hospital Data:</strong> {{ dataStatusText() }}
              </div>
            </div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button i18n type="button" (click)="openDiagnostics()">Open Diagnostics</button>
              <button i18n type="button" (click)="reingestData()">Re-ingest CSVs</button>
            </div>
          </div>

          <button i18n type="submit" [disabled]="adminForm().invalid() || isSaving()">
            Save Configuration
          </button>

          @if (message()) {
            <div class="message" role="alert" aria-live="polite">{{ message() }}</div>
          }
        </form>
      </div>
    } @else {
      <div i18n class="loading" aria-live="polite">Loading settings...</div>
    }
  `,
  styles: [
    `
      .admin-container {
        padding: 20px;
        max-width: 600px;
        margin: 0 auto;
      }
      .section {
        margin-bottom: 2rem;
        padding: 1rem;
        border: 1px solid #ccc;
        border-radius: 8px;
      }
      .key-item {
        margin-bottom: 1rem;
        display: flex;
        flex-direction: column;
      }
      .key-item label {
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #333;
      }
      .key-item input {
        padding: 0.5rem;
        font-size: 1rem;
        border: 1px solid #ccc;
        border-radius: 4px;
      }
      .key-item input:focus {
        outline: 2px solid #0056b3;
        outline-offset: 2px;
      }
      .model-item {
        margin-bottom: 0.5rem;
      }
      .model-item label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        color: #333;
      }
      button {
        padding: 0.75rem 1.5rem;
        font-size: 1rem;
        cursor: pointer;
        background-color: #0056b3;
        color: white;
        border: none;
        border-radius: 4px;
        font-weight: 600;
        transition: background-color 0.2s;
      }
      button:hover {
        background-color: #004494;
      }
      button:focus-visible {
        outline: 2px solid #0056b3;
        outline-offset: 2px;
      }
      button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
      }
      .message {
        margin-top: 1rem;
        color: #0f5132;
        background-color: #d1e7dd;
        border: 1px solid #badbcc;
        padding: 1rem;
        border-radius: 4px;
        font-weight: 600;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
      .loading {
        padding: 20px;
        text-align: center;
        color: #555;
      }
      h2,
      h3 {
        color: #222;
        margin-top: 0;
      }
      p {
        color: #555;
      }
      fieldset {
        border: none;
        padding: 0;
        margin: 0;
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
  adminForm = form(this.formModel, (f) => {});

  /**
   * Returns the current PostgreSQL connection status label.
   *
   * @returns Current PostgreSQL status label.
   */
  pgStatus(): string {
    return this.connectionService.healthData()?.postgres?.status || 'Unknown';
  }

  /**
   * Returns the current DuckDB OLAP engine status label.
   *
   * @returns Current DuckDB status label.
   */
  duckStatus(): string {
    return this.connectionService.healthData()?.duckdb?.status || 'Unknown';
  }

  /**
   * Returns a human-readable description of the hospital dataset status.
   *
   * @returns Human-readable dataset status description.
   */
  dataStatusText(): string {
    const data = this.connectionService.healthData()?.data;
    if (!data) return 'Checking...';
    return data.has_default_data ? 'Default CSV Present' : 'Synthetic Fallback Active';
  }

  /** Opens the system connection diagnostics modal dialog. */
  openDiagnostics(): void {
    this.connectionService.openDiagnosticsDialog();
  }

  /** Triggers a re-ingestion of the hospital CSV datasets on the backend. */
  reingestData(): void {
    this.connectionService.triggerReingest().subscribe({
      next: (res) => {
        this.message.set(res.message || 'Data re-ingested successfully!');
        const timer = setTimeout(() => this.message.set(''), 3000);
        this.destroyRef.onDestroy(() => clearTimeout(timer));
      },
      error: () => {
        this.message.set('Failed to re-ingest CSV data.');
        const timer = setTimeout(() => this.message.set(''), 3000);
        this.destroyRef.onDestroy(() => clearTimeout(timer));
      },
    });
  }

  /**
   * TrackBy function for rendering model checkboxes by index.
   *
   * @param index - The index of the item in the list.
   * @returns The item index.
   */
  trackByFn(index: number): number {
    return index;
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

  /** Validates and persists the updated API keys and visible model selections. */
  saveSettings(): void {
    if (this.adminForm().invalid()) return;

    this.isSaving.set(true);

    const formValue = this.formModel();
    const finalKeys: Record<string, string> = {};

    if (formValue.openai && formValue.openai.trim()) {
      finalKeys['openai'] = formValue.openai.trim();
    }
    if (formValue.anthropic && formValue.anthropic.trim()) {
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
          this.message.set('Settings saved successfully!');
          this.isSaving.set(false);
          const timer = setTimeout(() => this.message.set(''), 3000);
          this.destroyRef.onDestroy(() => clearTimeout(timer));
        },
        error: () => {
          this.isSaving.set(false);
          this.message.set('Error saving settings.');
        },
      });
  }
}
