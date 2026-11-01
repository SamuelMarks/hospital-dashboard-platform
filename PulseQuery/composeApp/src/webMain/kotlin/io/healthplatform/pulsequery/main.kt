/**
 * Web Application Entry Point module for Kotlin/Wasm and Kotlin/JS targets.
 */
package io.healthplatform.pulsequery

import androidx.compose.runtime.Composable
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.window.ComposeViewport
import io.healthplatform.pulsequery.database.KeyValueStorage
import io.healthplatform.pulsequery.database.WidgetCacheStorage
import io.healthplatform.pulsequery.di.AppContainer

/**
 * Initializes the in-memory web key-value storage and widget cache storage if not already set.
 */
fun initializeWebApplication() {
    if (AppContainer.keyValueStorage == null) {
        AppContainer.keyValueStorage = KeyValueStorage()
        AppContainer.widgetCacheStorage = WidgetCacheStorage()
    }
}

/**
 * Launches the web application by initializing storage and mounting the root [App] composable
 * via the supplied [viewportMount] function.
 *
 * @param viewportMount Lambda responsible for mounting the root `@Composable` content into the browser DOM.
 */
@OptIn(ExperimentalComposeUiApi::class)
fun launchWebApplication(
    viewportMount: (@Composable () -> Unit) -> Unit = { content -> ComposeViewport(content = content) }
) {
    initializeWebApplication()
    viewportMount {
        App()
    }
}

/**
 * Main application entry point for WebAssembly and JavaScript browser environments.
 * Initializes web key-value storage and mounts the root Compose application inside the browser viewport.
 */
fun main() {
    launchWebApplication()
}
