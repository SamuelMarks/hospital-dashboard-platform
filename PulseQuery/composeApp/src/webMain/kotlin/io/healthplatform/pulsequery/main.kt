/**
 * Web Application Entry Point module for Kotlin/Wasm and Kotlin/JS targets.
 */
package io.healthplatform.pulsequery

import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.window.ComposeViewport
import io.healthplatform.pulsequery.database.KeyValueStorage
import io.healthplatform.pulsequery.database.WidgetCacheStorage
import io.healthplatform.pulsequery.di.AppContainer

/**
 * Main application entry point for WebAssembly and JavaScript browser environments.
 * Initializes web key-value storage and mounts the root Compose application inside the browser viewport.
 */
@OptIn(ExperimentalComposeUiApi::class)
fun main() {
    if (AppContainer.keyValueStorage == null) {
        AppContainer.keyValueStorage = KeyValueStorage()
        AppContainer.widgetCacheStorage = WidgetCacheStorage()
    }
    ComposeViewport {
        App()
    }
}
