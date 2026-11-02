/**
 * JVM Desktop application entry point module for PulseQuery.
 */
package io.healthplatform.pulsequery

import androidx.compose.runtime.Composable
import androidx.compose.ui.window.ApplicationScope
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import io.healthplatform.pulsequery.database.DatabaseDriverFactory
import io.healthplatform.pulsequery.database.JvmDatabaseDriverFactory
import io.healthplatform.pulsequery.di.AppContainer

/**
 * Determines whether the desktop runtime is executing in a headless environment.
 *
 * @param headlessProperty Value of the `pulsequery.headless.test` system property.
 * @param awtHeadless Whether AWT [java.awt.GraphicsEnvironment.isHeadless] is active.
 * @return `true` when desktop window creation must be bypassed.
 */
fun isHeadlessDesktopEnvironment(
    headlessProperty: String? = System.getProperty("pulsequery.headless.test"),
    awtHeadless: Boolean = java.awt.GraphicsEnvironment.isHeadless()
): Boolean = headlessProperty == "true" || awtHeadless

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
    Window(
        onCloseRequest = { exitApplication() },
        title = "PulseQuery",
    ) {
        App()
    }
}

/**
 * Launches the desktop application, initializing SQLite storage and delegating window creation
 * to [windowLauncher] when [headless] is `false`.
 *
 * @param headless Whether the runtime environment is headless and should skip window creation.
 * @param driverFactory Database driver factory for desktop SQLite persistence.
 * @param windowLauncher Delegate that starts the Compose desktop [ApplicationScope] loop.
 */
fun launchDesktopApplication(
    headless: Boolean = isHeadlessDesktopEnvironment(),
    driverFactory: DatabaseDriverFactory = JvmDatabaseDriverFactory(),
    windowLauncher: (Boolean, @Composable ApplicationScope.() -> Unit) -> Unit = ::application
) {
    initializeDesktopApplication(driverFactory)
    if (!headless) {
        windowLauncher(false) {
            DesktopWindowContent()
        }
    }
}

/**
 * Launches the desktop window hosting the root [App] composable and initializes SQLite storage.
 */
fun main() {
    launchDesktopApplication()
}
