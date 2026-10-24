/**
 * @fileoverview Unit tests for DOM event input value extraction utilities.
 */

import { describe, it, expect } from 'vitest';
import { extractEventInputValue } from './dom-event.utils';
import { createMockInputEvent, createMockTargetEvent } from '../../../test-utils/mock-factories';

describe('extractEventInputValue', () => {
  it('returns the string value when event.target has a string value property', () => {
    const fakeEvent = createMockInputEvent('ICU_East');
    expect(extractEventInputValue(fakeEvent)).toBe('ICU_East');
  });

  it('returns an empty string when event.target is null or lacks a string value', () => {
    expect(extractEventInputValue(createMockTargetEvent(null))).toBe('');
    expect(extractEventInputValue(createMockTargetEvent({ value: 42 }))).toBe('');
  });
});
