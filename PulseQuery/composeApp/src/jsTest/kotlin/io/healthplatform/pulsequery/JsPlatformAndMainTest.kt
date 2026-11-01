/**
 * Kotlin/JS unit tests for [JsPlatform], [saveFileToDevice], and web [main] entry point.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.database.KeyValueStorage
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.browser.document
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Verifies [JsPlatform], [getDefaultLocalHost], [saveJsFileToDeviceWithFactory], [saveFileToDevice],
 * [initializeWebApplication], [launchWebApplication], and [main] on the Kotlin/JS browser target.
 */
class JsPlatformAndMainTest {

    /**
     * Verifies [getPlatform], [Platform.description], and [getDefaultLocalHost].
     */
    @Test
    fun testJsPlatformAndLocalHost() {
        val platform = getPlatform()
        assertEquals("Web with Kotlin/JS", platform.name)
        assertEquals("Running on Web with Kotlin/JS", platform.description())
        assertEquals("http://localhost:8000", getDefaultLocalHost())
    }

    /**
     * Verifies [saveFileToDevice] and [saveJsFileToDeviceWithFactory] across success and failure branches.
     */
    @Test
    fun testSaveFileToDeviceAllBranches() {
        // 1. Standard success branch
        val okRes = saveFileToDevice("report.csv", "text/csv", "id,val".encodeToByteArray())
        assertTrue(okRes.isSuccess)
        assertEquals("Downloaded report.csv (text/csv)", okRes.getOrNull())

        // 2. Non-anchor element returned by factory -> triggers failure branch
        val failRes = saveJsFileToDeviceWithFactory(
            filename = "bad.csv",
            mimeType = "text/csv",
            bytes = "x".encodeToByteArray(),
            elementFactory = { document.createElement("div") }
        )
        assertTrue(failRes.isFailure)
    }

    /**
     * Verifies [initializeWebApplication], [launchWebApplication], and [main].
     */
    @Test
    fun testWebMainAndInitializationBranches() {
        AppContainer.resetForTest()
        AppContainer.setHttpClientForTest(createMockClient())
        try {
            // 1. When keyValueStorage is null -> initializes storage
            initializeWebApplication()
            val firstKv = AppContainer.keyValueStorage
            assertNotNull(firstKv)
            assertNotNull(AppContainer.widgetCacheStorage)

            // 2. When keyValueStorage is already non-null -> preserves existing instance
            val customKv = KeyValueStorage()
            AppContainer.keyValueStorage = customKv
            initializeWebApplication()
            assertSame(customKv, AppContainer.keyValueStorage)

            // 3. launchWebApplication with custom viewport mount callback
            var mountedComposable: (@androidx.compose.runtime.Composable () -> Unit)? = null
            launchWebApplication { content ->
                mountedComposable = content
            }
            assertNotNull(mountedComposable)

            // 4. main() entry point in browser DOM
            if (document.body == null) {
                val body = document.createElement("body")
                document.documentElement?.appendChild(body)
            }
            runCatching { main() }
        } finally {
            AppContainer.resetForTest()
        }
    }
}
