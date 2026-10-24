/**
 * JVM Desktop application entry point module for PulseQuery.
 */
package io.healthplatform.pulsequery

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import io.healthplatform.pulsequery.database.JvmDatabaseDriverFactory
import io.healthplatform.pulsequery.di.AppContainer

/**
 * Launches the desktop window hosting the root [App] composable and initializes SQLite storage.
 */
fun main() = application {
    AppContainer.initDatabase(JvmDatabaseDriverFactory())
    Window(
        onCloseRequest = ::exitApplication,
        title = "PulseQuery",
    ) {
        App()
    }
}
