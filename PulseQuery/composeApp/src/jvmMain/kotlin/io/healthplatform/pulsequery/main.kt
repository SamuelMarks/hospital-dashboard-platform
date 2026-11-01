/**
 * JVM Desktop application entry point module for PulseQuery.
 */
package io.healthplatform.pulsequery

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.window.ApplicationScope
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import io.healthplatform.pulsequery.database.DatabaseDriverFactory
import io.healthplatform.pulsequery.database.JvmDatabaseDriverFactory
import io.healthplatform.pulsequery.di.AppContainer

/**
 * Initializes the JVM desktop storage layer using the provided [driverFactory].
 *
 * @param driverFactory Database driver factory for desktop SQLite persistence.
 */
fun initializeDesktopApplication(driverFactory: DatabaseDriverFactory = JvmDatabaseDriverFactory()) {
    AppContainer.initDatabase(driverFactory)
}

/**
 * Renders the root desktop [Window] inside a Compose [ApplicationScope].
 */
@Composable
fun ApplicationScope.DesktopWindowContent() {
    val exitImmediately = System.getProperty("pulsequery.headless.test") == "true"
    Window(
        onCloseRequest = ::exitApplication,
        title = "PulseQuery",
    ) {
        LaunchedEffect(exitImmediately) {
            if (exitImmediately) {
                exitApplication()
            }
        }
        App()
    }
}

/**
 * Launches the desktop window hosting the root [App] composable and initializes SQLite storage.
 */
fun main() = application(exitProcessOnExit = false) {
    initializeDesktopApplication()
    DesktopWindowContent()
}
