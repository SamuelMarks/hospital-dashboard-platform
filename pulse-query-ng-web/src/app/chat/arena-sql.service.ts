/**
 * @fileoverview Arena SQL execution client delegating to the generated OpenAPI `AiService`.
 */

import { inject, Injectable } from '@angular/core';
import { AiService, SQLExecutionRequest, SQLExecutionResponse } from '../api-client';
import { Observable } from 'rxjs';

/**
 * Payload for executing a read-only SQL preview query.
 */
export type SqlExecutionRequest = SQLExecutionRequest;

/**
 * Response shape returned by the read-only SQL preview endpoint.
 */
export type SqlExecutionResponse = SQLExecutionResponse;

/**
 * Service wrapper delegating read-only SQL preview execution to `AiService`.
 */
@Injectable({ providedIn: 'root' })
export class ArenaSqlService {
  /** Injected generated OpenAPI AI service client. */
  private readonly aiApi = inject(AiService);

  /**
   * Executes a read-only SQL preview query via `/api/v1/ai/execute`.
   *
   * @param request - SQL execution request payload.
   * @returns Observable emitting the SQL execution response.
   */
  execute(request: SqlExecutionRequest): Observable<SqlExecutionResponse> {
    return this.aiApi.executeSqlPreviewApiV1AiExecutePost(request);
  }
}
