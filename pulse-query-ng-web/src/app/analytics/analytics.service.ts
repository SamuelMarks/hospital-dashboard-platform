/**
 * @fileoverview Analytics API service delegating to the generated OpenAPI `AnalyticsService`.
 */

import { inject, Service } from '@angular/core';
import {
  AnalyticsService as GeneratedAnalyticsService,
  LlmOutputAnalyticsRow,
} from '../api-client';
import { Observable } from 'rxjs';

/**
 * Type alias re-exporting the generated `LlmOutputAnalyticsRow` DTO for LLM analytics views.
 */
export type LlmAnalyticsRow = LlmOutputAnalyticsRow;

/**
 * Service providing typed access to LLM candidate telemetry and analytics endpoints.
 */
@Service()
export class AnalyticsService {
  /** Injected generated OpenAPI analytics service client. */
  private readonly api = inject(GeneratedAnalyticsService);

  /**
   * Fetches paginated LLM output analytics rows from the backend.
   *
   * @param limit - Maximum number of rows to return (defaults to `500`).
   * @param offset - Pagination offset (defaults to `0`).
   * @returns Observable emitting the list of `LlmAnalyticsRow` items.
   */
  listLlmOutputs(limit = 500, offset = 0): Observable<LlmAnalyticsRow[]> {
    return this.api.listLlmOutputsApiV1AnalyticsLlmGet(limit, offset);
  }
}
