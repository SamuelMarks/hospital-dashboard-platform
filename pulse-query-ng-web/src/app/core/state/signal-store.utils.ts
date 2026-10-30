/**
 * @fileoverview Shared generic Signal Store state management helpers.
 *
 * Provides a strongly typed reactive state container (`SignalStateContainer<T>`)
 * that standardizes immutable `patch` updates and localized `extractApiErrorMessage`
 * error handling across feature stores (`DashboardStore`, `ChatStore`, `OptimizationStore`).
 */

import { Signal, WritableSignal, signal } from '@angular/core';
import { extractApiErrorMessage } from '../error.utils';

/**
 * Minimum state shape required for stores supporting standardized error patching.
 */
export interface ErrorTrackableState {
  /** User-facing error message or `null` when healthy. */
  readonly error: string | null;
}

/**
 * Strongly typed reactive state container encapsulating a `WritableSignal<T>`,
 * shallow partial `patch(partial)` updates, and standardized `patchError(err, fallback)`.
 */
export interface SignalStateContainer<T extends ErrorTrackableState> {
  /** Read-only signal exposing the current immutable state snapshot `T`. */
  readonly state: Signal<T>;
  /** Underlying writable signal for direct state replacement or functional updates. */
  readonly writableState: WritableSignal<T>;
  /**
   * Immutably merges `partial` into the current state snapshot.
   *
   * @param partial - Subset of state properties to update.
   */
  readonly patch: (partial: Partial<T>) => void;
  /**
   * Extracts a localized user-facing message from `err` via `extractApiErrorMessage`
   * and patches `{ error: msg }` into the state.
   *
   * @param err - Caught error value (`HttpErrorResponse`, `Error`, or `unknown`).
   * @param fallback - Default localized message when `err` carries no detail.
   * @returns Resolved user-facing error message string.
   */
  readonly patchError: (err: unknown, fallback?: string) => string;
}

/**
 * Creates a standardized `SignalStateContainer<T>` for an Angular Signal Store.
 *
 * @param initialState - Initial immutable state object.
 * @returns Configured `SignalStateContainer<T>` instance.
 */
export function createSignalStateContainer<T extends ErrorTrackableState>(
  initialState: T,
): SignalStateContainer<T> {
  const writableState = signal<T>(initialState);

  const patch = (partial: Partial<T>): void => {
    writableState.update((current) => ({ ...current, ...partial }));
  };

  const patchError = (err: unknown, fallback = $localize`An unexpected error occurred`): string => {
    const msg = extractApiErrorMessage(err, fallback);
    patch({ error: msg } as Partial<T>);
    return msg;
  };

  return {
    state: writableState.asReadonly(),
    writableState,
    patch,
    patchError,
  };
}
