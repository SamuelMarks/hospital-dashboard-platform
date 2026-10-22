/**
 * @fileoverview Unit tests for DOM event input value extraction utilities.
 */

import { describe, it, expect } from 'vitest';
import { extractEventInputValue } from './dom-event.utils';

describe('extractEventInputValue', () => {
  it('returns the string value when event.target has a string value property', () => {
    const fakeEvent = { target: { value: 'ICU_East' } } as unknown as Event;
    expect(extractEventInputValue(fakeEvent)).toBe('ICU_East');
  });

  it('returns an empty string when event.target is null or lacks a string value', () => {
    expect(extractEventInputValue({ target: null } as unknown as Event)).toBe('');
    expect(extractEventInputValue({ target: { value: 42 } } as unknown as Event)).toBe('');
  });
});
