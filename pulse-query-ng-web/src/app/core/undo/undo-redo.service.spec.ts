/** @docs */
/**
 * @fileoverview Unit tests for UndoRedoService.
 */

import { TestBed } from '@angular/core/testing';
import { UndoRedoService, Command } from './undo-redo.service';
import { vi } from 'vitest';

/**
 * Test suite for UndoRedoService.
 */
describe('UndoRedoService', () => {
  let service: UndoRedoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UndoRedoService],
    });
    service = TestBed.inject(UndoRedoService);
  });

  /**
   * Test: Service creation.
   */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * Test: Initially has no undo/redo available.
   */
  it('should initially have no undo/redo available', () => {
    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(false);
    expect(service.undoStackSize()).toBe(0);
    expect(service.redoStackSize()).toBe(0);
  });

  /**
   * Test: Executes a command.
   */
  it('should execute a command', async () => {
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    const command: Command = {
      id: 'test-1',
      description: 'Test command',
      execute: executeFn,
      undo: undoFn,
      timestamp: new Date(),
    };

    await service.execute(command);

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(service.canUndo()).toBe(true);
    expect(service.undoStackSize()).toBe(1);
  });

  /**
   * Test: Undoes a command.
   */
  it('should undo a command', async () => {
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    const command: Command = {
      id: 'test-1',
      description: 'Test command',
      execute: executeFn,
      undo: undoFn,
      timestamp: new Date(),
    };

    await service.execute(command);
    await service.undo();

    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(true);
    expect(service.redoStackSize()).toBe(1);
  });

  /**
   * Test: Redoes a command.
   */
  it('should redo a command', async () => {
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    const command: Command = {
      id: 'test-1',
      description: 'Test command',
      execute: executeFn,
      undo: undoFn,
      timestamp: new Date(),
    };

    await service.execute(command);
    await service.undo();
    await service.redo();

    expect(executeFn).toHaveBeenCalledTimes(2); // Once for execute, once for redo
    expect(service.canUndo()).toBe(true);
    expect(service.canRedo()).toBe(false);
  });

  /**
   * Test: Clears redo stack when new command is executed.
   */
  it('should clear redo stack when new command is executed', async () => {
    const command1: Command = {
      id: 'test-1',
      description: 'Command 1',
      execute: vi.fn(),
      undo: vi.fn(),
      timestamp: new Date(),
    };

    const command2: Command = {
      id: 'test-2',
      description: 'Command 2',
      execute: vi.fn(),
      undo: vi.fn(),
      timestamp: new Date(),
    };

    await service.execute(command1);
    await service.undo();
    expect(service.canRedo()).toBe(true);

    await service.execute(command2);
    expect(service.canRedo()).toBe(false);
  });

  /**
   * Test: Handles multiple commands.
   */
  it('should handle multiple commands', async () => {
    const commands: Command[] = [];

    for (let i = 0; i < 5; i++) {
      commands.push({
        id: `test-${i}`,
        description: `Command ${i}`,
        execute: vi.fn(),
        undo: vi.fn(),
        timestamp: new Date(),
      });
    }

    for (const cmd of commands) {
      await service.execute(cmd);
    }

    expect(service.undoStackSize()).toBe(5);

    await service.undo();
    await service.undo();

    expect(service.undoStackSize()).toBe(3);
    expect(service.redoStackSize()).toBe(2);
  });

  /**
   * Test: Returns correct next undo description.
   */
  it('should return correct next undo description', async () => {
    expect(service.nextUndoDescription()).toBeNull();

    const command: Command = {
      id: 'test-1',
      description: 'Test command',
      execute: vi.fn(),
      undo: vi.fn(),
      timestamp: new Date(),
    };

    await service.execute(command);
    expect(service.nextUndoDescription()).toBe('Test command');

    await service.undo();
    expect(service.nextUndoDescription()).toBeNull();
  });

  /**
   * Test: Returns correct next redo description.
   */
  it('should return correct next redo description', async () => {
    expect(service.nextRedoDescription()).toBeNull();

    const command: Command = {
      id: 'test-1',
      description: 'Test command',
      execute: vi.fn(),
      undo: vi.fn(),
      timestamp: new Date(),
    };

    await service.execute(command);
    await service.undo();

    expect(service.nextRedoDescription()).toBe('Test command');

    await service.redo();
    expect(service.nextRedoDescription()).toBeNull();
  });

  /**
   * Test: Clears both stacks.
   */
  it('should clear both stacks', async () => {
    const command: Command = {
      id: 'test-1',
      description: 'Test command',
      execute: vi.fn(),
      undo: vi.fn(),
      timestamp: new Date(),
    };

    await service.execute(command);
    await service.undo();

    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(true);

    service.clear();

    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(false);
    expect(service.undoStackSize()).toBe(0);
    expect(service.redoStackSize()).toBe(0);
  });

  /**
   * Test: Limits history size.
   */
  it('should limit history size to MAX_HISTORY_SIZE', async () => {
    const commands: Command[] = [];

    for (let i = 0; i < 60; i++) {
      commands.push({
        id: `test-${i}`,
        description: `Command ${i}`,
        execute: vi.fn(),
        undo: vi.fn(),
        timestamp: new Date(),
      });
    }

    for (const cmd of commands) {
      await service.execute(cmd);
    }

    expect(service.undoStackSize()).toBeLessThanOrEqual(50);
  });

  /**
   * Test: Gets undo history.
   */
  it('should get undo history', async () => {
    const command: Command = {
      id: 'test-1',
      description: 'Test command',
      execute: vi.fn(),
      undo: vi.fn(),
      timestamp: new Date(),
    };

    await service.execute(command);

    const history = service.getUndoHistory();
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('test-1');
  });

  /**
   * Test: Gets redo history.
   */
  it('should get redo history', async () => {
    const command: Command = {
      id: 'test-1',
      description: 'Test command',
      execute: vi.fn(),
      undo: vi.fn(),
      timestamp: new Date(),
    };

    await service.execute(command);
    await service.undo();

    const history = service.getRedoHistory();
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('test-1');
  });

  /**
   * Test: Handles async commands.
   */
  it('should handle async commands', async () => {
    const executeFn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const undoFn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const command: Command = {
      id: 'test-1',
      description: 'Async command',
      execute: executeFn,
      undo: undoFn,
      timestamp: new Date(),
    };

    await service.execute(command);
    expect(executeFn).toHaveBeenCalled();

    await service.undo();
    expect(undoFn).toHaveBeenCalled();
  });

  /**
   * Test: Does nothing when undoing with empty stack.
   */
  it('should do nothing when undoing with empty stack', async () => {
    await service.undo();
    expect(service.canUndo()).toBe(false);
  });

  /**
   * Test: Does nothing when redoing with empty stack.
   */
  it('should do nothing when redoing with empty stack', async () => {
    await service.redo();
    expect(service.canRedo()).toBe(false);
  });
});
