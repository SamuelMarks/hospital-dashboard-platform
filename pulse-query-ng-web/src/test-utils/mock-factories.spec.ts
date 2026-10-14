/**
 * @fileoverview Unit tests for `mock-factories.ts`.
 */

import {
  createMockConversation,
  createMockDashboard,
  createMockUser,
  createMockWidget,
} from './mock-factories';

describe('mock-factories', () => {
  it('creates mock dashboards with defaults and overrides', () => {
    expect(createMockDashboard().id).toBe('dash-1');
    expect(createMockDashboard({ id: 'custom-dash', name: 'ICU' })).toEqual(
      expect.objectContaining({ id: 'custom-dash', name: 'ICU' }),
    );
  });

  it('creates mock widgets with defaults and overrides', () => {
    expect(createMockWidget().id).toBe('widget-1');
    expect(createMockWidget({ id: 'w-9', visualization: 'pie' })).toEqual(
      expect.objectContaining({ id: 'w-9', visualization: 'pie' }),
    );
  });

  it('creates mock conversations with defaults and overrides', () => {
    expect(createMockConversation().id).toBe('conv-1');
    expect(createMockConversation({ id: 'c-9', title: 'Custom' })).toEqual(
      expect.objectContaining({ id: 'c-9', title: 'Custom' }),
    );
  });

  it('creates mock users with defaults and overrides', () => {
    expect(createMockUser().email).toBe('clinician@hospital.org');
    expect(createMockUser({ is_admin: true })).toEqual(expect.objectContaining({ is_admin: true }));
  });
});
