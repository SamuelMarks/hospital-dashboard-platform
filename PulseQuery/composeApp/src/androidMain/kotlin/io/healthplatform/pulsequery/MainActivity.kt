/**
 * Android Main Activity entry point module hosting the root Compose UI and initializing SQLDelight storage.
 */
package io.healthplatform.pulsequery

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import io.healthplatform.pulsequery.database.AndroidDatabaseDriverFactory
import io.healthplatform.pulsequery.di.AppContainer

/**
 * Primary Android [ComponentActivity] hosting the PulseQuery Compose Multiplatform application.
 */
class MainActivity : ComponentActivity() {
    /**
     * Initializes edge-to-edge display, configures the Android SQLDelight database driver,
     * and mounts the [App] composable hierarchy.
     *
     * @param savedInstanceState Previously saved instance state bundle, or null on cold start.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        AppContainer.initDatabase(AndroidDatabaseDriverFactory(applicationContext))

        setContent {
            App()
        }
    }
}

/**
 * Android Studio design-time preview for the root [App] composable.
 */
@Preview
@Composable
fun AppAndroidPreview() {
    App()
}
