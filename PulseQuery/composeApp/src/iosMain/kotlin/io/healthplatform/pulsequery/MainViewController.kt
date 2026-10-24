/**
 * iOS UIKit ViewController bridge module mounting the PulseQuery Compose UI.
 */
package io.healthplatform.pulsequery

import androidx.compose.ui.window.ComposeUIViewController
import io.healthplatform.pulsequery.database.IosDatabaseDriverFactory
import io.healthplatform.pulsequery.di.AppContainer
import platform.UIKit.UIViewController

/**
 * Creates the root iOS [UIViewController] hosting the PulseQuery Compose Multiplatform interface
 * and initializes the native Darwin SQLite database driver.
 *
 * @return Configured [UIViewController] embedding the Compose root [App].
 */
@Suppress("FunctionNaming", "ktlint:standard:function-naming")
fun MainViewController(): UIViewController = ComposeUIViewController {
    AppContainer.initDatabase(IosDatabaseDriverFactory())
    App()
}
