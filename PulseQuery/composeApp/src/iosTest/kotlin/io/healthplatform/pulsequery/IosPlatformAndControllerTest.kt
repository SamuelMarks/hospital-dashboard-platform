/**
 * iOS unit tests for [IOSPlatform], [saveFileToDevice], [IosDatabaseDriverFactory], and [MainViewController].
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.database.IosDatabaseDriverFactory
import io.healthplatform.pulsequery.database.createDatabase
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.cinterop.ExperimentalForeignApi
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSURL
import platform.Foundation.NSUserDomainMask
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Verifies [IOSPlatform], [getDefaultLocalHost], [resolveIosTargetDir], [toNsData],
 * [writeIosPayloadWithFallback], [saveFileToDevice], [IosDatabaseDriverFactory],
 * [initializeIosApplication], and [MainViewController] on the iOS simulator target.
 */
class IosPlatformAndControllerTest {

    /**
     * Verifies [getPlatform], [Platform.description], and [getDefaultLocalHost].
     */
    @Test
    fun testPlatformAndLocalHost() {
        val platform = getPlatform()
        assertTrue(platform.name.isNotBlank())
        assertTrue(platform.description().startsWith("Running on "))
        assertEquals("http://localhost:8000", getDefaultLocalHost())
    }

    /**
     * Verifies all branches of [resolveIosTargetDir], [toNsData], [writeIosPayloadWithFallback],
     * and [saveFileToDevice].
     */
    @OptIn(ExperimentalForeignApi::class)
    @Test
    fun testIosFileHelpersAndSaveFileToDeviceAllBranches() {
        // 1. resolveIosTargetDir branches
        assertEquals(
            "/docs",
            resolveIosTargetDir(
                baseDir = "/docs",
                dirExists = { true },
                createDir = { false },
                tempDirProvider = { "/tmp" }
            )
        )
        assertEquals(
            "/docs",
            resolveIosTargetDir(
                baseDir = "/docs",
                dirExists = { false },
                createDir = { true },
                tempDirProvider = { "/tmp" }
            )
        )
        assertEquals(
            "/tmp",
            resolveIosTargetDir(
                baseDir = "/docs",
                dirExists = { false },
                createDir = { false },
                tempDirProvider = { "/tmp" }
            )
        )
        assertEquals(
            "/tmp",
            resolveIosTargetDir(
                baseDir = null,
                dirExists = { true },
                createDir = { true },
                tempDirProvider = { "/tmp" }
            )
        )
        // Default tempDirProvider branch
        assertTrue(
            resolveIosTargetDir(
                baseDir = null,
                dirExists = { false },
                createDir = { false }
            ).isNotEmpty()
        )

        // 2. toNsData empty and non-empty branches
        val emptyData = byteArrayOf().toNsData()
        assertEquals(0UL, emptyData.length)
        val nonEmptyData = "pulse".encodeToByteArray().toNsData()
        assertEquals(5UL, nonEmptyData.length)

        // 3. writeIosPayloadWithFallback branches
        // 3a. Primary write succeeds
        val okPrimary = writeIosPayloadWithFallback(
            filename = "a.txt",
            targetDir = "/docs/",
            tempDir = "/tmp/"
        ) { true }
        assertTrue(okPrimary.isSuccess)
        assertEquals("/docs/a.txt", okPrimary.getOrNull())

        // 3b. Primary write fails, target != tempDir, fallback write succeeds
        var attempt = 0
        val okFallback = writeIosPayloadWithFallback(
            filename = "b.txt",
            targetDir = "/docs/",
            tempDir = "/tmp/"
        ) {
            attempt++
            attempt == 2
        }
        assertTrue(okFallback.isSuccess)
        assertEquals("/tmp/b.txt", okFallback.getOrNull())

        // 3c. Primary write fails, target != tempDir, fallback write also fails
        val failBoth = writeIosPayloadWithFallback(
            filename = "c.txt",
            targetDir = "/docs/",
            tempDir = "/tmp/"
        ) { false }
        assertTrue(failBoth.isFailure)

        // 3d. Primary write fails and target == tempDir (skips fallback retry)
        val failSameTemp = writeIosPayloadWithFallback(
            filename = "d.txt",
            targetDir = "/tmp/",
            tempDir = "/tmp"
        ) { false }
        assertTrue(failSameTemp.isFailure)

        // 3e. Writer throws exception (caught by runCatching)
        val failThrown = writeIosPayloadWithFallback(
            filename = "e.txt",
            targetDir = "/docs"
        ) { error("Simulated write crash") }
        assertTrue(failThrown.isFailure)

        // 4. Actual saveFileToDevice end-to-end (both when Documents dir does not exist and when it exists)
        val fileManager = NSFileManager.defaultManager
        val docUrl = fileManager.URLsForDirectory(NSDocumentDirectory, NSUserDomainMask).firstOrNull() as? NSURL
        val docPath = docUrl?.path
        if (docPath != null && fileManager.fileExistsAtPath(docPath)) {
            fileManager.removeItemAtPath(docPath, null)
        }

        val resNonEmpty = saveFileToDevice("ios_export.csv", "text/csv", "col1,col2".encodeToByteArray())
        assertTrue(resNonEmpty.isSuccess)

        val resEmpty = saveFileToDevice("ios_empty.txt", "text/plain", byteArrayOf())
        assertTrue(resEmpty.isSuccess)
    }

    /**
     * Verifies [IosDatabaseDriverFactory], [initializeIosApplication], and [MainViewController].
     */
    @Test
    fun testIosDatabaseDriverFactoryAndMainViewController() {
        AppContainer.resetForTest()
        AppContainer.setHttpClientForTest(createMockClient())
        try {
            val factory = IosDatabaseDriverFactory()
            val db = createDatabase(factory)
            assertNotNull(db)

            initializeIosApplication(factory)
            assertNotNull(AppContainer.keyValueStorage)
            assertNotNull(AppContainer.widgetCacheStorage)

            val viewController = MainViewController()
            assertNotNull(viewController)
        } finally {
            AppContainer.resetForTest()
        }
    }
}
