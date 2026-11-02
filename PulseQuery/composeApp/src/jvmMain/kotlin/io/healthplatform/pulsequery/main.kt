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
 * Renders the root desktop [Window] inside a Compose [ApplicationScope], or exits immediately
 * when running in a headless environment or under the `pulsequery.headless.test` harness property.
 */
@Composable
fun ApplicationScope.DesktopWindowContent() {
    if (System.getProperty("pulsequery.headless.test") == "true" ||
        java.awt.GraphicsEnvironment.isHeadless()
    ) {
        LaunchedEffect(Unit) {
            exitApplication()
        }
        return
    }
    Window(
        onCloseRequest = ::exitApplication,
        title = "PulseQuery",
    ) {
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
