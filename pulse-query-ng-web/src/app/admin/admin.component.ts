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
import { AdminService, AdminSettingsUpdateRequest, AiService, ModelInfo } from '../api-client';
import { ConnectionStatusService } from '../core/health/connection-status.service';
import { extractEventInputValue } from '../shared/utils/dom-event.utils';
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
  /** Additional `any-llm` provider API keys (e.g. `groq`, `mistral`, `gemini`, `cohere`). */
  customProviderKeys = signal<Record<string, string>>({});
  /** Configured `any-llm` model identifiers (`provider:model`). */
  configuredModels = signal<string[]>([]);
  /** Optional custom Ollama base URL override. */
  ollamaApiBase = signal<string>('');
  /** New custom `any-llm` provider slug input. */
  newProviderSlug = signal<string>('');
  /** New custom `any-llm` provider API key input. */
  newProviderKey = signal<string>('');
  /** New `any-llm` model (`provider:model`) input. */
  newModelSpec = signal<string>('');

  /** Computed list of custom `any-llm` provider key entries. */
  readonly customProviderEntries = computed(() => Object.entries(this.customProviderKeys()));

  /**
   * Extracts string value from a DOM input event.
   *
   * @param event - DOM input event.
   * @returns Extracted string value.
   */
  getEventValue(event: Event): string {
    return extractEventInputValue(event);
  }

  /**
   * Adds or updates a custom Mozilla `any-llm` provider API key entry.
   */
  addCustomProviderKey(): void {
    const slug = this.newProviderSlug().trim().toLowerCase();
    const key = this.newProviderKey().trim();
    if (!slug || !key) return;
    this.customProviderKeys.update((curr) => ({ ...curr, [slug]: key }));
    this.newProviderSlug.set('');
    this.newProviderKey.set('');
  }

  /**
   * Removes a custom `any-llm` provider API key entry.
   *
   * @param provider - Provider slug to remove.
   */
  removeCustomProviderKey(provider: string): void {
    this.customProviderKeys.update((curr) => {
      const next = { ...curr };
      delete next[provider];
      return next;
    });
  }

  /**
   * Adds a new `provider:model` specification to `configuredModels`.
   */
  addConfiguredModel(): void {
    const spec = this.newModelSpec().trim();
    if (!spec || (!spec.includes(':') && !spec.includes('/'))) return;
    if (!this.configuredModels().includes(spec)) {
      this.configuredModels.update((curr) => [...curr, spec]);
    }
    this.newModelSpec.set('');
  }

  /**
   * Removes a configured `any-llm` model specification.
   *
   * @param spec - Model specification string to remove.
   */
  removeConfiguredModel(spec: string): void {
    this.configuredModels.update((curr) => curr.filter((m) => m !== spec));
  }

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

        const rawKeys = settings.api_keys || {};
        const extraKeys: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawKeys)) {
          if (k !== 'openai' && k !== 'anthropic') {
            extraKeys[k] = v;
          }
        }
        this.customProviderKeys.set(extraKeys);
        this.configuredModels.set(settings.configured_models || []);
        this.ollamaApiBase.set(settings.ollama_api_base || '');

        this.formModel.set({
          openai: rawKeys['openai'] || '',
          anthropic: rawKeys['anthropic'] || '',
          models: models.map((model) => settings.visible_models.includes(model.id)),
        });

        this.settingsLoaded.set(true);
      });
  }

  /** Persists the updated API keys and visible model selections. */
  saveSettings(): void {
    this.isSaving.set(true);

    const formValue = this.formModel();
    const finalKeys: Record<string, string> = { ...this.customProviderKeys() };

    if (formValue.openai.trim()) {
      finalKeys['openai'] = formValue.openai.trim();
    }
    if (formValue.anthropic.trim()) {
      finalKeys['anthropic'] = formValue.anthropic.trim();
    }

    const selectedModels = this.availableModels()
      .filter((_, index) => formValue.models[index])
      .map((model) => model.id);

    const payload: AdminSettingsUpdateRequest = {
      api_keys: finalKeys,
      visible_models: selectedModels,
    };
    if (this.configuredModels().length > 0) {
      payload.configured_models = this.configuredModels();
    }
    if (this.ollamaApiBase().trim()) {
      payload.ollama_api_base = this.ollamaApiBase().trim();
    }

    this.adminService
      .writeAdminSettingsApiV1AdminSettingsPut(payload)
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
