/**
 * @fileoverview Unit tests for `ProcessorCatalogService` and `mapModelInfoToProcessorOption`.
 */

import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AiService, ModelInfo } from '../../api-client';
import {
  ProcessorCatalogService,
  SQL_NO_MODEL_OPTION,
  mapModelInfoToProcessorOption,
} from './processor-catalog.service';

describe('ProcessorCatalogService', () => {
  let service: ProcessorCatalogService;
  let aiServiceMock: { listAvailableModelsApiV1AiModelsGet: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    aiServiceMock = {
      listAvailableModelsApiV1AiModelsGet: vi.fn().mockReturnValue(of([])),
    };

    TestBed.configureTestingModule({
      providers: [ProcessorCatalogService, { provide: AiService, useValue: aiServiceMock }],
    });

    service = TestBed.inject(ProcessorCatalogService);
  });

  it('should map ModelInfo variants to ProcessorOption categories accurately', () => {
    const sqlOpt = mapModelInfoToProcessorOption({
      id: 'SQL',
      name: '',
      provider: '',
      is_local: true,
      processor_type: 'SQL',
    });
    expect(sqlOpt.category).toBe('SQL');
    expect(sqlOpt.name).toBe(SQL_NO_MODEL_OPTION.name);

    const ollamaOpt = mapModelInfoToProcessorOption({
      id: 'ollama:llama3',
      name: 'Llama 3',
      provider: '',
      is_local: false,
    });
    expect(ollamaOpt.category).toBe('OLLAMA');
    expect(ollamaOpt.provider).toBe('ollama');

    const anyLlmOpt = mapModelInfoToProcessorOption({
      id: 'openai:gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      is_local: false,
      processor_type: 'ANY_LLM',
    });
    expect(anyLlmOpt.category).toBe('ANY_LLM');
  });

  it('should load processors and group into SQL, Ollama, and any-llm', () => {
    const models: ModelInfo[] = [
      { id: 'SQL', name: 'SQL [no model]', provider: 'sql', is_local: true, processor_type: 'SQL' },
      {
        id: 'ollama:llama3',
        name: 'Llama 3',
        provider: 'ollama',
        is_local: true,
        processor_type: 'OLLAMA',
      },
      {
        id: 'openai:gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        is_local: false,
        processor_type: 'ANY_LLM',
      },
    ];
    aiServiceMock.listAvailableModelsApiV1AiModelsGet.mockReturnValue(of(models));

    service.loadProcessors();

    expect(service.processors().length).toBe(3);
    expect(service.sqlProcessors().length).toBe(1);
    expect(service.ollamaProcessors().length).toBe(1);
    expect(service.anyLlmProcessors().length).toBe(1);
  });

  it('should prepend SQL [no model] when backend omits it or fails', () => {
    aiServiceMock.listAvailableModelsApiV1AiModelsGet.mockReturnValue(
      of([{ id: 'groq:mixtral', name: 'Mixtral', provider: 'groq', is_local: false }]),
    );
    service.loadProcessors();
    expect(service.sqlProcessors()[0]?.id).toBe('SQL');
    expect(service.anyLlmProcessors()[0]?.id).toBe('groq:mixtral');

    aiServiceMock.listAvailableModelsApiV1AiModelsGet.mockReturnValue(
      throwError(() => new Error('network error')),
    );
    service.loadProcessors();
    expect(service.processors()).toEqual([SQL_NO_MODEL_OPTION]);

    aiServiceMock.listAvailableModelsApiV1AiModelsGet.mockReturnValue(of(null as never));
    service.loadProcessors();
    expect(service.processors()).toEqual([SQL_NO_MODEL_OPTION]);
  });
});
