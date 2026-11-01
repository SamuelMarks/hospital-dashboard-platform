/**
 * Unit tests for JVM platform utilities, desktop entry point, and [JvmDatabaseDriverFactory].
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.database.JvmDatabaseDriverFactory
import io.healthplatform.pulsequery.database.createDatabase
import io.healthplatform.pulsequery.di.AppContainer
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Verifies [Platform], [JVMPlatform], [getDefaultLocalHost], [saveFileToDevice],
 * [JvmDatabaseDriverFactory], and [main] on the JVM target.
 */
class JvmPlatformAndMainTest {

    /**
     * Verifies [getPlatform], [Platform.description], and [getDefaultLocalHost].
     */
    @Test
    fun testPlatformAndLocalHost() {
        val platform = getPlatform()
        assertTrue(platform.name.startsWith("Java "))
        assertTrue(platform.description().startsWith("Running on Java "))
        assertEquals("http://localhost:8000", getDefaultLocalHost())
    }

    /**
     * Verifies [saveFileToDevice] when the user's Downloads directory exists, when it must be created,
     * and when writing fails.
     */
    @Test
    fun testSaveFileToDeviceBranches() {
        val origUserHome = System.getProperty("user.home")
        val tempHome = File.createTempFile("pq_home_", "").apply {
            delete()
            mkdirs()
        }
        try {
            System.setProperty("user.home", tempHome.absolutePath)

            // 1. Downloads directory does not exist yet -> mkdirs() branch
            val res1 = saveFileToDevice("report1.txt", "text/plain", "hello".encodeToByteArray())
            assertTrue(res1.isSuccess)
            val saved1 = File(res1.getOrNull() ?: "")
            assertTrue(saved1.exists())
            assertEquals("hello", saved1.readText())

            // 2. Downloads directory already exists -> !downloadsDir.exists() false branch
            val res2 = saveFileToDevice("report2.txt", "text/plain", "world".encodeToByteArray())
            assertTrue(res2.isSuccess)
            val saved2 = File(res2.getOrNull() ?: "")
            assertTrue(saved2.exists())
            assertEquals("world", saved2.readText())

            // 3. Failure branch (e.g. target filename is an existing directory)
            val dirAsFile = File(File(tempHome, "Downloads"), "bad_target")
            dirAsFile.mkdirs()
            val resFail = saveFileToDevice("bad_target", "text/plain", "fail".encodeToByteArray())
            assertTrue(resFail.isFailure)
        } finally {
            if (origUserHome != null) {
                System.setProperty("user.home", origUserHome)
            }
            tempHome.deleteRecursively()
        }
    }

    /**
     * Verifies [JvmDatabaseDriverFactory] with null (in-memory), non-existent file, and existing file.
     */
    @Test
    fun testJvmDatabaseDriverFactoryAllBranches() {
        // 1. In-memory (dbFile == null)
        val inMemDriver = JvmDatabaseDriverFactory(null).createDriver()
        assertNotNull(inMemDriver)
        inMemDriver.close()

        // 2. Non-existent file (dbFile != null && !dbFile.exists())
        val tempDbFile = File.createTempFile("pq_test_db_", ".db")
        tempDbFile.delete()
        try {
            val fileDriver1 = JvmDatabaseDriverFactory(tempDbFile).createDriver()
            assertTrue(tempDbFile.exists())
            fileDriver1.close()

            // 3. Existing file (dbFile != null && dbFile.exists())
            val db2 = createDatabase(JvmDatabaseDriverFactory(tempDbFile))
            assertNotNull(db2)
        } finally {
            tempDbFile.delete()
        }
    }

    /**
     * Verifies [initializeDesktopApplication] and [main] in headless test mode.
     */
    @Test
    fun testDesktopMainAndInit() {
        AppContainer.resetForTest()
        AppContainer.setHttpClientForTest(createMockClient())
        initializeDesktopApplication()
        assertNotNull(AppContainer.keyValueStorage)

        System.setProperty("pulsequery.headless.test", "true")
        try {
            main()
        } finally {
            System.clearProperty("pulsequery.headless.test")
            AppContainer.resetForTest()
        }
    }
}
