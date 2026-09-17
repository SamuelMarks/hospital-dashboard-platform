/**
 * Unit tests for UndoRedoManager command pattern implementation.
 */
package io.healthplatform.pulsequery.core.undo

import io.healthplatform.pulsequery.core.error.PulseQueryError
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Unit tests verifying [UndoRedoManager] stack management, capacity limiting, and command execution.
 */
class UndoRedoManagerTest {

    private class TestCommand(
        override val description: String,
        private val onExecute: () -> Boolean = { true },
        private val onUndo: () -> Boolean = { true }
    ) : DashboardCommand {
        var executeCount = 0
        var undoCount = 0

        override suspend fun execute(): Result<Unit> {
            executeCount++
            return if (onExecute()) Result.success(Unit) else Result.failure(PulseQueryError.Command.ExecutionFailed("Execute failed"))
        }

        override suspend fun undo(): Result<Unit> {
            undoCount++
            return if (onUndo()) Result.success(Unit) else Result.failure(PulseQueryError.Command.ExecutionFailed("Undo failed"))
        }
    }

    @Test
    fun testExecuteAndUndoRedoCycle() = runTest {
        val manager = UndoRedoManager(maxHistory = 5)

        assertFalse(manager.canUndo.value)
        assertFalse(manager.canRedo.value)

        val cmd1 = TestCommand("Add Widget 1")
        val res = manager.executeCommand(cmd1)
        assertTrue(res.isSuccess)
        assertEquals(1, cmd1.executeCount)
        assertTrue(manager.canUndo.value)
        assertFalse(manager.canRedo.value)
        assertEquals("Add Widget 1", manager.lastActionDescription.value)

        // Undo
        val undoRes = manager.undo()
        assertTrue(undoRes.isSuccess)
        assertEquals(1, cmd1.undoCount)
        assertFalse(manager.canUndo.value)
        assertTrue(manager.canRedo.value)
        assertEquals("Undone: Add Widget 1", manager.lastActionDescription.value)

        // Redo
        val redoRes = manager.redo()
        assertTrue(redoRes.isSuccess)
        assertEquals(2, cmd1.executeCount)
        assertTrue(manager.canUndo.value)
        assertFalse(manager.canRedo.value)
        assertEquals("Redone: Add Widget 1", manager.lastActionDescription.value)
    }

    @Test
    fun testMaxHistoryLimit() = runTest {
        val manager = UndoRedoManager(maxHistory = 2)

        manager.executeCommand(TestCommand("C1"))
        manager.executeCommand(TestCommand("C2"))
        manager.executeCommand(TestCommand("C3"))

        // Can undo C3 then C2, but not C1 because it was dropped due to limit of 2
        assertTrue(manager.undo().isSuccess)
        assertEquals("Undone: C3", manager.lastActionDescription.value)
        assertTrue(manager.undo().isSuccess)
        assertEquals("Undone: C2", manager.lastActionDescription.value)
        assertFalse(manager.canUndo.value)
    }

    @Test
    fun testNewCommandClearsRedoStack() = runTest {
        val manager = UndoRedoManager(maxHistory = 10)

        manager.executeCommand(TestCommand("C1"))
        manager.undo()
        assertTrue(manager.canRedo.value)

        // New command should invalidate redo
        manager.executeCommand(TestCommand("C2"))
        assertFalse(manager.canRedo.value)
    }

    @Test
    fun testUndoEmptyFails() = runTest {
        val manager = UndoRedoManager()
        val res = manager.undo()
        assertTrue(res.isFailure)
        assertIs<PulseQueryError.Command.NoUndoAvailable>(res.exceptionOrNull())
    }

    @Test
    fun testRedoEmptyFails() = runTest {
        val manager = UndoRedoManager()
        val res = manager.redo()
        assertTrue(res.isFailure)
        assertIs<PulseQueryError.Command.NoRedoAvailable>(res.exceptionOrNull())
    }

    @Test
    fun testClear() = runTest {
        val manager = UndoRedoManager()
        manager.executeCommand(TestCommand("C1"))
        manager.clear()
        assertFalse(manager.canUndo.value)
        assertFalse(manager.canRedo.value)
    }
}
