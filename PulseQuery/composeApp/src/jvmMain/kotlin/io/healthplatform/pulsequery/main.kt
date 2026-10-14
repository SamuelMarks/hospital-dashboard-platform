/**
 * JVM Desktop application entry point module for PulseQuery.
 */
package io.healthplatform.pulsequery

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application

/**
 * Launches the desktop window hosting the root [App] composable.
 */
fun main() = application {
    Window(
        onCloseRequest = ::exitApplication,
        title = "PulseQuery",
    ) {
        App()
    }
}
