package io.healthplatform.pulsequery

import androidx.compose.ui.window.ComposeUIViewController
import io.healthplatform.pulsequery.database.IosDatabaseDriverFactory
import io.healthplatform.pulsequery.di.AppContainer

fun MainViewController() = ComposeUIViewController {
    AppContainer.initDatabase(IosDatabaseDriverFactory())
    App()
}