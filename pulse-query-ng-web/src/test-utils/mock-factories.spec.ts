/**
 * @fileoverview Unit tests for `mock-factories.ts`.
 */

import {
  createMockCandidate,
  createMockConversation,
  createMockDashboard,
  createMockHttpErrorResponse,
  createMockInputEvent,
  createMockMessage,
  createMockQueryCartItem,
  createMockRouterStateSnapshot,
  createMockTargetEvent,
  createMockUser,
  createMockWidget,
} from './mock-factories';

describe('mock-factories', () => {
  it('creates mock widgets with defaults and overrides', () => {
    expect(createMockWidget().id).toBe('w-1');
    expect(createMockWidget({ id: 'w-99', title: 'Custom' })).toEqual(
      expect.objectContaining({ id: 'w-99', title: 'Custom' }),
    );
  });

  it('creates mock dashboards with defaults and overrides', () => {
    expect(createMockDashboard().id).toBe('dash-1');
    expect(createMockDashboard({ name: 'ICU' })).toEqual(expect.objectContaining({ name: 'ICU' }));
  });

  it('creates mock conversations, candidates, and messages with defaults and overrides', () => {
    expect(createMockConversation().id).toBe('conv-1');
    expect(createMockConversation({ title: 'Override' }).title).toBe('Override');

    expect(createMockCandidate().id).toBe('cand-1');
    expect(createMockCandidate({ is_selected: true }).is_selected).toBe(true);

    expect(createMockMessage().id).toBe('msg-1');
    expect(createMockMessage({ role: 'assistant' }).role).toBe('assistant');
  });

  it('creates mock users with defaults and overrides', () => {
    expect(createMockUser().email).toBe('clinician@hospital.org');
    expect(createMockUser({ is_admin: true })).toEqual(expect.objectContaining({ is_admin: true }));
  });

  it('creates mock DOM input and target events', () => {
    const inputEvt = createMockInputEvent('ICU_East');
    expect((inputEvt.target as HTMLInputElement).value).toBe('ICU_East');

    const targetEvt = createMockTargetEvent(null, 'change');
    expect(targetEvt.target).toBeNull();
    expect(targetEvt.type).toBe('change');
  });

  it('creates mock query cart items, router state snapshots, and HTTP error responses', () => {
    expect(createMockQueryCartItem().id).toBe('qc-1');
    expect(createMockQueryCartItem({ title: 'Custom Cart' }).title).toBe('Custom Cart');

    const snapshot = createMockRouterStateSnapshot('/analytics', 'Analytics');
    expect(snapshot.url).toBe('/analytics');
    expect(snapshot.root.title).toBe('Analytics');
    expect(snapshot.toString()).toContain('/analytics');

    const defaultSnapshot = createMockRouterStateSnapshot();
    expect(defaultSnapshot.url).toBe('/');

    const httpErr = createMockHttpErrorResponse(404, 'Not found');
    expect(httpErr.status).toBe(404);
    expect(httpErr.error).toEqual({ detail: 'Not found' });
  });
});
