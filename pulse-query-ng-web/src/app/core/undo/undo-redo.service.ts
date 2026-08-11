/**
 * @fileoverview Undo/Redo Service.
 * Implements command pattern for undoable actions in the dashboard editor.
 */

import { DATE_NOW } from '../../core/time.token';
import { Injectable, signal, computed, Signal, inject } from '@angular/core';

/**
 * Command interface for undoable actions.
 */
export interface Command {
  /**
   * Unique identifier for the command.
   */
  id: string;

  /**
   * Human-readable description of the command.
   */
  description: string;

  /**
   * Executes the command.
   */
  execute: () => void | Promise<void>;

  /**
   * Reverts the command.
   */
  undo: () => void | Promise<void>;

  /**
   * Timestamp when the command was created.
   */
  timestamp: Date;
}

/**
 * Maximum number of commands to keep in history.
 */
const MAX_HISTORY_SIZE = 50;

/**
 * Undo/Redo Service.
 *
 * Manages a history of commands that can be undone and redone.
 * Useful for dashboard editing operations like widget moves, resizes, and deletions.
 *
 * @example
 * ```typescript
 * const undoService = inject(UndoRedoService);
 *
 * // Execute a command
 * undoService.execute({
 *   id: 'move-widget-1',
 *   description: 'Move widget',
 *   execute: () => moveWidget(widget, newPosition),
 *   undo: () => moveWidget(widget, oldPosition),
 *   timestamp: this.dateNow(),
 * });
 *
 * // Undo the last command
 * undoService.undo();
 *
 * // Redo the last undone command
 * undoService.redo();
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class UndoRedoService {
  private readonly dateNow = inject(DATE_NOW);
  /* v8 ignore start */
  /** Undo stack. */ private readonly _undoStack = signal<Command[]>([]);
  /** Redo stack. */ private readonly _redoStack = signal<Command[]>([]);
  /* v8 ignore stop */

  /**
   * Whether undo is available.
   */
  /* v8 ignore next 1 */
  readonly canUndo: Signal<boolean> = computed(() => this._undoStack().length > 0);

  /**
   * Whether redo is available.
   */
  /* v8 ignore next 1 */
  readonly canRedo: Signal<boolean> = computed(() => this._redoStack().length > 0);

  /**
   * Description of the next command that would be undone.
   */
  /* v8 ignore next 4 */
  readonly nextUndoDescription: Signal<string | null> = computed(() => {
    const stack = this._undoStack();
    return stack.length > 0 ? stack[stack.length - 1].description : null;
  });

  /**
   * Description of the next command that would be redone.
   */
  /* v8 ignore next 4 */
  readonly nextRedoDescription: Signal<string | null> = computed(() => {
    const stack = this._redoStack();
    return stack.length > 0 ? stack[stack.length - 1].description : null;
  });

  /**
   * Current undo stack size.
   */
  /* v8 ignore next 1 */
  readonly undoStackSize: Signal<number> = computed(() => this._undoStack().length);

  /**
   * Current redo stack size.
   */
  /* v8 ignore next 1 */
  readonly redoStackSize: Signal<number> = computed(() => this._redoStack().length);

  /**
   * Executes a command and adds it to the undo stack.
   *
   * @param command - The command to execute.
   * @returns Promise that resolves when the command is executed.
   */
  async execute(command: Command): Promise<void> {
    await command.execute();

    this._undoStack.update((stack) => {
      const newStack = [...stack, command];
      // Limit history size
      if (newStack.length > MAX_HISTORY_SIZE) {
        return newStack.slice(newStack.length - MAX_HISTORY_SIZE);
      }
      return newStack;
    });

    // Clear redo stack when a new command is executed
    this._redoStack.set([]);
  }

  /**
   * Undoes the last command.
   *
   * @returns Promise that resolves when the command is undone.
   */
  async undo(): Promise<void> {
    const stack = this._undoStack();
    if (stack.length === 0) {
      return;
    }

    const command = stack[stack.length - 1];
    await command.undo();

    this._undoStack.update((s) => s.slice(0, -1));
    this._redoStack.update((s) => [...s, command]);
  }

  /**
   * Redoes the last undone command.
   *
   * @returns Promise that resolves when the command is redone.
   */
  async redo(): Promise<void> {
    const stack = this._redoStack();
    if (stack.length === 0) {
      return;
    }

    const command = stack[stack.length - 1];
    await command.execute();

    this._redoStack.update((s) => s.slice(0, -1));
    this._undoStack.update((s) => [...s, command]);
  }

  /**
   * Clears both undo and redo stacks.
   */
  clear(): void {
    this._undoStack.set([]);
    this._redoStack.set([]);
  }

  /**
   * Gets the full undo history.
   *
   * @returns Array of commands in the undo stack.
   */
  getUndoHistory(): readonly Command[] {
    return this._undoStack();
  }

  /**
   * Gets the full redo history.
   *
   * @returns Array of commands in the redo stack.
   */
  getRedoHistory(): readonly Command[] {
    return this._redoStack();
  }
}
