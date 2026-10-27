/**
 * @fileoverview Strongly typed mock factories for Angular unit and integration tests.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import {
  ConversationResponse,
  DashboardResponse,
  MessageCandidateResponse,
  MessageResponse,
  UserResponse,
  WidgetResponse,
} from '../app/api-client';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from '../app/global/query-cart.models';

/**
 * Creates a strongly typed `WidgetResponse` fixture with sensible defaults.
 *
 * @param overrides - Partial widget properties to override defaults.
 * @returns Complete `WidgetResponse` test fixture.
 */
export function createMockWidget(overrides: Partial<WidgetResponse> = {}): WidgetResponse {
  return {
    id: 'w-1',
    dashboard_id: 'dash-1',
    title: 'Sample Widget',
    type: 'SQL',
    visualization: 'table',
    config: { query: 'SELECT 1' },
    ...overrides,
  };
}

/**
 * Creates a strongly typed `DashboardResponse` fixture with sensible defaults.
 *
 * @param overrides - Partial dashboard properties to override defaults.
 * @returns Complete `DashboardResponse` test fixture.
 */
export function createMockDashboard(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    id: 'dash-1',
    name: 'Clinical Overview',
    owner_id: 'user-1',
    widgets: [],
    ...overrides,
  };
}

/**
 * Creates a strongly typed `ConversationResponse` fixture with sensible defaults.
 *
 * @param overrides - Partial conversation properties to override defaults.
 * @returns Complete `ConversationResponse` test fixture.
 */
export function createMockConversation(
  overrides: Partial<ConversationResponse> = {},
): ConversationResponse {
  return {
    id: 'conv-1',
    title: 'Sample Conversation',
    user_id: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a strongly typed `MessageCandidateResponse` fixture with sensible defaults.
 *
 * @param overrides - Partial candidate properties to override defaults.
 * @returns Complete `MessageCandidateResponse` test fixture.
 */
export function createMockCandidate(
  overrides: Partial<MessageCandidateResponse> = {},
): MessageCandidateResponse {
  return {
    id: 'cand-1',
    model_name: 'gpt-4o',
    content: 'Candidate response',
    sql_snippet: 'SELECT 1',
    sql_hash: 'hash-1',
    is_selected: false,
    ...overrides,
  };
}

/**
 * Creates a strongly typed `MessageResponse` fixture with sensible defaults.
 *
 * @param overrides - Partial message properties to override defaults.
 * @returns Complete `MessageResponse` test fixture.
 */
export function createMockMessage(overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'user',
    content: 'Hello',
    created_at: '2026-01-01T00:00:00Z',
    candidates: [],
    ...overrides,
  };
}

/**
 * Creates a strongly typed `UserResponse` fixture with sensible defaults.
 *
 * @param overrides - Partial user properties to override defaults.
 * @returns Complete `UserResponse` test fixture.
 */
export function createMockUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 'user-1',
    email: 'clinician@hospital.org',
    is_active: true,
    is_admin: false,
    language_preference: 'en',
    ...overrides,
  };
}

/**
 * Creates a real DOM `Event` whose `target` is an `HTMLInputElement` initialized to `value`.
 *
 * @param value - Input value string to assign to the target input element.
 * @param eventType - DOM event type name (defaults to `'input'`).
 * @returns Real `Event` instance with a populated `HTMLInputElement` target.
 */
export function createMockInputEvent(value: string, eventType = 'input'): Event {
  const input = document.createElement('input');
  input.value = value;
  const event = new Event(eventType);
  Object.defineProperty(event, 'target', { value: input });
  return event;
}

/**
 * Creates a real DOM `Event` with a custom `target` property descriptor.
 *
 * @param target - Target value to attach to `event.target`.
 * @param eventType - DOM event type name (defaults to `'input'`).
 * @returns Real `Event` instance with the provided `target`.
 */
export function createMockTargetEvent(target: unknown, eventType = 'input'): Event {
  const event = new Event(eventType);
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

/**
 * Creates a strongly typed `QueryCartItem` fixture with sensible defaults.
 *
 * @param overrides - Partial query cart item properties to override defaults.
 * @returns Complete `QueryCartItem` test fixture.
 */
export function createMockQueryCartItem(overrides: Partial<QueryCartItem> = {}): QueryCartItem {
  return {
    id: 'qc-1',
    title: 'Sample Query',
    sql: 'SELECT 1',
    createdAt: '2026-01-01T00:00:00Z',
    kind: QUERY_CART_ITEM_KIND,
    ...overrides,
  };
}

/**
 * Creates a strongly typed `RouterStateSnapshot` fixture without untyped object casts.
 *
 * @param url - Active router URL string (defaults to `'/'`).
 * @param title - Optional route title string.
 * @returns Strongly typed `RouterStateSnapshot` test double.
 */
export function createMockRouterStateSnapshot(url = '/', title?: string): RouterStateSnapshot {
  const root = new ActivatedRouteSnapshot();
  Object.defineProperty(root, 'title', { value: title, configurable: true });
  return {
    url,
    root,
    toString: () => `RouterStateSnapshot(url="${url}")`,
  };
}

/**
 * Creates a real `HttpErrorResponse` instance for testing API error branches.
 *
 * @param status - HTTP status code (e.g. `400`, `404`, `500`).
 * @param detail - Error detail string or structured error payload.
 * @returns Configured `HttpErrorResponse` instance.
 */
export function createMockHttpErrorResponse(status: number, detail: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'Error',
    error: { detail },
  });
}
