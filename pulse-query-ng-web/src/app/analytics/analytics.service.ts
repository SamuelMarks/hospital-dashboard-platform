/**
 * Analytics API service and DTOs.
 *
 * Provides typed access to the backend analytics endpoints.
 */
import { Injectable, Inject, Optional } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BASE_PATH } from '../api-client';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

/** Single analytics row returned by the backend. */
export interface LlmAnalyticsRow {
  /** Data origin label. */
  source: 'chat' | 'ai';
  /** Unique candidate identifier. */
  candidate_id: string;
  /** Assistant message identifier (chat arena only). */
  assistant_message_id?: string | null;
  /** Conversation identifier (chat arena only). */
  conversation_id?: string | null;
  /** Conversation title (chat arena only). */
  conversation_title?: string | null;
  /** User identifier. */
  user_id: string;
  /** User email. */
  user_email: string;
  /** User query text. */
  query_text?: string | null;
  /** Prompt strategy used (AI arena only). */
  prompt_strategy?: string | null;
  /** LLM display label. */
  llm: string;
  /** SQL snippet if present. */
  sql_snippet?: string | null;
  /** SQL hash for grouping. */
  sql_hash?: string | null;
  /** Whether user selected this candidate. */
  is_selected: boolean;
  /** ISO timestamp for the candidate row. */
  created_at: string;
}

/** Client for analytics endpoints. */
@Injectable({ providedIn: 'root' })
/* v8 ignore start */
export class AnalyticsService {
  /* v8 ignore stop */
  /** Resolved API base URL. */
  private readonly baseUrl: string;

  /**
   * Creates a new AnalyticsService.
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
   * Fetch the flattened LLM analytics rows.
   *
   * @param limit Maximum number of rows to return.
   * @param offset Offset for pagination.
   */
  listLlmOutputs(limit = 500, offset = 0): Observable<LlmAnalyticsRow[]> {
    const params = new HttpParams().set('limit', String(limit)).set('offset', String(offset));
    return this.http.get<LlmAnalyticsRow[]>(`${this.baseUrl}/api/v1/analytics/llm`, { params });
  }
}
