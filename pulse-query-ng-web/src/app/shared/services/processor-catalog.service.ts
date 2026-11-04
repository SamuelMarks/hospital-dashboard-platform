/**
 * @fileoverview Centralized catalog service for resolving selectable widget processors
 * (`SQL [no model]`, default choice & dynamically discovered local Ollama models, `gemma-4-sql`, and configured Mozilla `any-llm` models).
 */

import { Service, inject, signal, computed } from '@angular/core';
import { catchError, of } from 'rxjs';
import { AiService, ModelInfo } from '../../api-client';

/**
 * Strongly typed processor option exposed to dropdowns in Widget Builder, Widget Editor, and Widget Cards.
 */
export interface ProcessorOption {
  /** Unique processor identifier (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`). */
  id: string;
  /** Human-readable display label. */
  name: string;
  /** Provider slug (`'sql'`, `'ollama'`, `'openai'`, `'anthropic'`, `'gemini'`, `'gemma4sql'`, etc.). */
  provider: string;
  /** Whether the processor executes locally. */
  isLocal: boolean;
  /** High-level category for `<mat-optgroup>` grouping. */
  category: 'SQL' | 'OLLAMA' | 'ANY_LLM';
}

/**
 * Built-in fallback option representing direct read-only pooled DuckDB SQL execution (`SQL [no model]`).
 */
export const SQL_NO_MODEL_OPTION: ProcessorOption = {
  id: 'SQL',
  name: $localize`:@@processorSqlNoModel:SQL [no model]`,
  provider: 'sql',
  isLocal: true,
  category: 'SQL',
};

/**
 * Categorizes a raw `ModelInfo` record into a strongly typed `ProcessorOption`.
 *
 * @param model - Raw `ModelInfo` returned by the backend `/api/v1/ai/models` endpoint.
 * @returns Normalized `ProcessorOption` object.
 */
export function mapModelInfoToProcessorOption(model: ModelInfo): ProcessorOption {
  const rawType = model.processor_type;
  const prov = (model.provider || '').toLowerCase();
  const idLower = model.id.toLowerCase();

  if (rawType === 'SQL' || model.id === 'SQL' || prov === 'sql') {
    return {
      id: 'SQL',
      name: model.name || SQL_NO_MODEL_OPTION.name,
      provider: 'sql',
      isLocal: true,
      category: 'SQL',
    };
  }

  if (
    rawType === 'OLLAMA' ||
    rawType === 'GEMMA_4_SQL' ||
    prov === 'ollama' ||
    prov === 'gemma4sql' ||
    idLower.startsWith('ollama:') ||
    idLower.startsWith('ollama/') ||
    idLower.startsWith('gemma4sql:') ||
    model.is_local
  ) {
    return {
      id: model.id,
      name: model.name,
      provider: model.provider || 'ollama',
      isLocal: true,
      category: 'OLLAMA',
    };
  }

  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    isLocal: false,
    category: 'ANY_LLM',
  };
}

/**
 * Service managing the reactive catalog of available widget processors (`SQL [no model]`, Ollama, `gemma-4-sql`, and `any-llm`).
 */
@Service()
export class ProcessorCatalogService {
  /** Injected AI API client for querying `/api/v1/ai/models`. */
  private readonly aiApi = inject(AiService);

  /** Internal writable signal holding all resolved processor options. */
  private readonly optionsSignal = signal<ProcessorOption[]>([SQL_NO_MODEL_OPTION]);

  /** Read-only signal of all available processor options (always includes `SQL [no model]`). */
  readonly processors = this.optionsSignal.asReadonly();

  /** Computed list of `SQL [no model]` processor options. */
  readonly sqlProcessors = computed(() =>
    this.optionsSignal().filter((opt) => opt.category === 'SQL'),
  );

  /** Computed list of discovered/configured local Ollama and `gemma-4-sql` model options. */
  readonly ollamaProcessors = computed(() =>
    this.optionsSignal().filter((opt) => opt.category === 'OLLAMA'),
  );

  /** Computed list of configured Mozilla `any-llm` and cloud model options. */
  readonly anyLlmProcessors = computed(() =>
    this.optionsSignal().filter((opt) => opt.category === 'ANY_LLM'),
  );

  /**
   * Fetches available models from the backend (including `SQL [no model]`, default choice models, and discovered Ollama models)
   * and updates the reactive processor catalog.
   */
  loadProcessors(): void {
    this.aiApi
      .listAvailableModelsApiV1AiModelsGet(false, undefined, 'body', false, {
        includeSql: true,
        discoverOllama: true,
      })
      .pipe(catchError(() => of<ModelInfo[]>([])))
      .subscribe((models) => {
        const connectedModels = (models ?? []).filter((m) => !m.status || m.status === 'connected');
        const mapped = connectedModels.map(mapModelInfoToProcessorOption);
        const hasSql = mapped.some((opt) => opt.id === 'SQL');
        this.optionsSignal.set(hasSql ? mapped : [SQL_NO_MODEL_OPTION, ...mapped]);
      });
  }
}
