/**
 * @fileoverview Unit tests for `AnalyticsService`.
 */

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, type Mock } from 'vitest';
import { AnalyticsService, LlmAnalyticsRow } from './analytics.service';
import { AnalyticsService as GeneratedAnalyticsService } from '../api-client';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockGeneratedApi: { listLlmOutputsApiV1AnalyticsLlmGet: Mock };

  beforeEach(() => {
    mockGeneratedApi = {
      listLlmOutputsApiV1AnalyticsLlmGet: vi.fn().mockReturnValue(of([])),
    };

    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: GeneratedAnalyticsService, useValue: mockGeneratedApi },
      ],
    });
    service = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('delegates listLlmOutputs with explicit limit and offset to generated AnalyticsService', () => {
    const sampleRows: LlmAnalyticsRow[] = [
      {
        source: 'chat',
        candidate_id: 'c1',
        user_id: 'u1',
        user_email: 'doc@hospital.org',
        llm: 'GPT-4o',
        is_selected: true,
        created_at: '2026-10-14T00:00:00Z',
      },
    ];
    mockGeneratedApi.listLlmOutputsApiV1AnalyticsLlmGet.mockReturnValue(of(sampleRows));

    let received: LlmAnalyticsRow[] = [];
    service.listLlmOutputs(10, 5).subscribe((rows) => {
      received = rows;
    });

    expect(mockGeneratedApi.listLlmOutputsApiV1AnalyticsLlmGet).toHaveBeenCalledWith(10, 5);
    expect(received).toEqual(sampleRows);
  });

  it('uses default limit=500 and offset=0 when arguments are omitted', () => {
    service.listLlmOutputs().subscribe();
    expect(mockGeneratedApi.listLlmOutputsApiV1AnalyticsLlmGet).toHaveBeenCalledWith(500, 0);
  });
});
