/**
 * Arena SQL execution client.
 *
 * Executes candidate SQL snippets against the preview endpoint.
 */
import { Injectable, Inject, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BASE_PATH } from '../api-client';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

/** Payload for executing a SQL preview. */
export interface SqlExecutionRequest {
  /** SQL query text. */
  sql: string;
  /** Optional row limit for previews. */
  max_rows?: number;
  /** Optional global parameters injected into templates. */
  global_params?: Record<string, any>;
}

/** Response shape for SQL preview execution. */
export interface SqlExecutionResponse {
  /** Result rows. */
  data: Record<string, any>[];
  /** Column list. */
  columns: string[];
  /** Optional error message. */
  error?: string | null;
}

/** Service wrapper for the AI execute endpoint. */
@Injectable({ providedIn: 'root' })
export class ArenaSqlService {
  /** Resolved API base URL. */
  private readonly baseUrl: string;

  /**
   * Creates a new ArenaSqlService.
   *
   * @param http Http client for API calls.
   * @param basePath Optional API base path token.
   */
  constructor(
    private readonly http: HttpClient,
    @Optional() @Inject(BASE_PATH) basePath?: string | string[],
  ) {
    const resolved = Array.isArray(basePath) ? basePath[0] : basePath;
    this.baseUrl = resolved || environment.apiUrl || 'http://localhost:8000';
  }

  /**
   * Execute a SQL preview request.
   *
   * @param request Execution payload.
   */
  execute(request: SqlExecutionRequest): Observable<SqlExecutionResponse> {
    return this.http.post<SqlExecutionResponse>(`${this.baseUrl}/api/v1/ai/execute`, request);
  }
}
