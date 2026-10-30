/**
 * @fileoverview Unit tests for `createSignalStateContainer` in `signal-store.utils.ts`.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { createSignalStateContainer, ErrorTrackableState } from './signal-store.utils';

/** Test state interface extending `ErrorTrackableState`. */
interface SampleStoreState extends ErrorTrackableState {
  /** Sample numeric counter. */
  readonly count: number;
  /** Loading flag. */
  readonly isLoading: boolean;
}

describe('createSignalStateContainer', () => {
  it('initializes state and applies immutable partial patches', () => {
    const container = createSignalStateContainer<SampleStoreState>({
      count: 0,
      isLoading: false,
      error: null,
    });

    expect(container.state()).toEqual({ count: 0, isLoading: false, error: null });

    container.patch({ count: 5, isLoading: true });
    expect(container.state()).toEqual({ count: 5, isLoading: true, error: null });
    expect(container.writableState().count).toBe(5);
  });

  it('patches extracted API error messages with default and custom fallbacks', () => {
    const container = createSignalStateContainer<SampleStoreState>({
      count: 1,
      isLoading: false,
      error: null,
    });

    const resolved1 = container.patchError(
      new HttpErrorResponse({ status: 400, error: { detail: 'Bad query' } }),
    );
    expect(resolved1).toBe('Bad query');
    expect(container.state().error).toBe('Bad query');

    const resolved2 = container.patchError(null, 'Custom fallback error');
    expect(resolved2).toBe('Custom fallback error');
    expect(container.state().error).toBe('Custom fallback error');
  });
});
