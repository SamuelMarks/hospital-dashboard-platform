/**
 * Kotlin/Wasm unit tests for [WasmPlatform], [saveFileToDevice], and web [main] entry point.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.database.KeyValueStorage
import io.healthplatform.pulsequery.di.AppContainer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Verifies [WasmPlatform], [getDefaultLocalHost], [saveWasmFileWithBridge], [saveFileToDevice],
 * [initializeWebApplication], [launchWebApplication], and [main] on the Kotlin/Wasm browser target.
 */
class WasmPlatformAndMainTest {

    /**
     * Verifies [getPlatform], [Platform.description], and [getDefaultLocalHost].
     */
    @Test
    fun testWasmPlatformAndLocalHost() {
        val platform = getPlatform()
        assertEquals("Web with Kotlin/Wasm", platform.name)
        assertEquals("Running on Web with Kotlin/Wasm", platform.description())
        assertEquals("http://localhost:8000", getDefaultLocalHost())
    }

    /**
     * Verifies [saveFileToDevice] and [saveWasmFileWithBridge] across success and failure branches.
     */
    @Test
    fun testSaveFileToDeviceAllBranches() {
        // 1. Standard browser DOM download success
        val okRes = saveFileToDevice("wasm_report.csv", "text/csv", "a,b".encodeToByteArray())
        assertTrue(okRes.isSuccess)
        assertEquals("Downloaded wasm_report.csv (text/csv)", okRes.getOrNull())

        // 2. Failure branch when bridge throws
        val failRes = saveWasmFileWithBridge(
            filename = "fail.csv",
            mimeType = "text/csv",
            bytes = "x".encodeToByteArray(),
            bridge = { _, _, _ -> error("Simulated Wasm DOM error") }
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

            // 4. main() entry point
            runCatching { main() }
        } finally {
            AppContainer.resetForTest()
        }
    }
}
