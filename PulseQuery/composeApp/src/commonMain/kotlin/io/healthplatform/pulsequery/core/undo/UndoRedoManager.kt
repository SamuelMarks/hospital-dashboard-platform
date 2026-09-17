/**
 * Undo/Redo Command Architecture module for reversible dashboard operations.
 */
package io.healthplatform.pulsequery.core.undo

import io.healthplatform.pulsequery.core.error.PulseQueryError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Interface representing an undoable dashboard command following the Command Pattern.
 */
interface DashboardCommand {
    /** Human-readable explanation of the action performed. */
    val description: String

    /**
     * Executes or reapplies the mutation action.
     *
     * @return [Result] containing [Unit] on success or exception on failure.
     */
    suspend fun execute(): Result<Unit>

    /**
     * Reverts the mutation action back to its prior state.
     *
     * @return [Result] containing [Unit] on success or exception on failure.
     */
    suspend fun undo(): Result<Unit>
}

/**
 * Manages an in-memory stack of undoable and redoable [DashboardCommand] operations,
 * bounded by a maximum history capacity.
 *
 * @param maxHistory Maximum number of historical commands preserved in the undo stack.
 */
class UndoRedoManager(private val maxHistory: Int = 50) {

    private val undoStack: MutableList<DashboardCommand> = mutableListOf()
    private val redoStack: MutableList<DashboardCommand> = mutableListOf()

    private val _canUndo: MutableStateFlow<Boolean> = MutableStateFlow(false)
    /** Exposes whether an action is currently available to undo. */
    val canUndo: StateFlow<Boolean> = _canUndo.asStateFlow()

    private val _canRedo: MutableStateFlow<Boolean> = MutableStateFlow(false)
    /** Exposes whether an action is currently available to redo. */
    val canRedo: StateFlow<Boolean> = _canRedo.asStateFlow()

    private val _lastActionDescription: MutableStateFlow<String?> = MutableStateFlow(null)
    /** Exposes the human-readable description of the most recent action. */
    val lastActionDescription: StateFlow<String?> = _lastActionDescription.asStateFlow()

    /**
     * Executes a new command and pushes it onto the undo stack, clearing any prior redo history.
     *
     * @param command The [DashboardCommand] to execute and record.
     * @return [Result] indicating success or failure of the execution.
     */
    suspend fun executeCommand(command: DashboardCommand): Result<Unit> {
        val result = command.execute()
        if (result.isSuccess) {
            undoStack.add(command)
            if (undoStack.size > maxHistory) {
                undoStack.removeAt(0)
            }
            redoStack.clear()
            _lastActionDescription.value = command.description
            updateFlags()
        }
        return result
    }

    /**
     * Reverts the most recently executed command on the undo stack and moves it to the redo stack.
     *
     * @return [Result] indicating success or failure of the undo operation.
     */
    suspend fun undo(): Result<Unit> {
        if (undoStack.isEmpty()) {
            return Result.failure(PulseQueryError.Command.NoUndoAvailable())
        }
        val command = undoStack.removeAt(undoStack.lastIndex)
        val result = command.undo()
        if (result.isSuccess) {
            redoStack.add(command)
            _lastActionDescription.value = "Undone: ${command.description}"
            updateFlags()
        } else {
            // Re-insert command back on failure to preserve stack integrity
            undoStack.add(command)
        }
        return result
    }

    /**
     * Re-executes the most recently undone command on the redo stack and moves it back to the undo stack.
     *
     * @return [Result] indicating success or failure of the redo operation.
     */
    suspend fun redo(): Result<Unit> {
        if (redoStack.isEmpty()) {
            return Result.failure(PulseQueryError.Command.NoRedoAvailable())
        }
        val command = redoStack.removeAt(redoStack.lastIndex)
        val result = command.execute()
        if (result.isSuccess) {
            undoStack.add(command)
            _lastActionDescription.value = "Redone: ${command.description}"
            updateFlags()
        } else {
            // Re-insert command back on failure to preserve stack integrity
            redoStack.add(command)
        }
        return result
    }

    /**
     * Clears all recorded undo and redo history.
     */
    fun clear() {
        undoStack.clear()
        redoStack.clear()
        _lastActionDescription.value = null
        updateFlags()
    }

    private fun updateFlags() {
        _canUndo.value = undoStack.isNotEmpty()
        _canRedo.value = redoStack.isNotEmpty()
    }
}
