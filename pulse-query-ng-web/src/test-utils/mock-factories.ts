/**
 * @fileoverview Strongly typed mock factories for Angular unit and integration tests.
 */

import {
  ConversationResponse,
  DashboardResponse,
  MessageCandidateResponse,
  MessageResponse,
  UserResponse,
  WidgetResponse,
} from '../app/api-client';

/**
 * Creates a strongly typed `DashboardResponse` test fixture with optional property overrides.
 *
 * @param overrides - Partial properties to override on the default mock dashboard.
 * @returns Strongly typed `DashboardResponse` instance.
 */
export function createMockDashboard(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    id: 'dash-1',
    name: 'Hospital Command Center',
    owner_id: 'user-1',
    widgets: [],
    ...overrides,
  };
}

/**
 * Creates a strongly typed `WidgetResponse` test fixture with optional property overrides.
 *
 * @param overrides - Partial properties to override on the default mock widget.
 * @returns Strongly typed `WidgetResponse` instance.
 */
export function createMockWidget(overrides: Partial<WidgetResponse> = {}): WidgetResponse {
  return {
    id: 'widget-1',
    dashboard_id: 'dash-1',
    title: 'ICU Bed Occupancy',
    type: 'SQL',
    visualization: 'table',
    config: { query: 'SELECT * FROM hospital_data LIMIT 10', x: 0, y: 0, w: 6, h: 4 },
    ...overrides,
  };
}

/**
 * Creates a strongly typed `ConversationResponse` test fixture with optional property overrides.
 *
 * @param overrides - Partial properties to override on the default mock conversation.
 * @returns Strongly typed `ConversationResponse` instance.
 */
export function createMockConversation(
  overrides: Partial<ConversationResponse> = {},
): ConversationResponse {
  return {
    id: 'conv-1',
    title: 'Cardiology Census Inquiry',
    user_id: 'user-1',
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a strongly typed `MessageCandidateResponse` test fixture with optional property overrides.
 *
 * @param overrides - Partial properties to override on the default mock candidate.
 * @returns Strongly typed `MessageCandidateResponse` instance.
 */
export function createMockCandidate(
  overrides: Partial<MessageCandidateResponse> = {},
): MessageCandidateResponse {
  return {
    id: 'cand-1',
    model_name: 'Model-A',
    content: 'Candidate response',
    sql_snippet: null,
    sql_hash: null,
    is_selected: false,
    ...overrides,
  };
}

/**
 * Creates a strongly typed `MessageResponse` test fixture with optional property overrides.
 *
 * @param overrides - Partial properties to override on the default mock message.
 * @returns Strongly typed `MessageResponse` instance.
 */
export function createMockMessage(overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'assistant',
    content: 'Default message content',
    created_at: '2026-10-14T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a strongly typed `UserResponse` test fixture with optional property overrides.
 *
 * @param overrides - Partial properties to override on the default mock user.
 * @returns Strongly typed `UserResponse` instance.
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
