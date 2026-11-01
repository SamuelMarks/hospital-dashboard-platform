/**
 * Android Robolectric unit tests for [AndroidPlatform], [MainActivity], and [AndroidDatabaseDriverFactory].
 */
package io.healthplatform.pulsequery

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.database.AndroidDatabaseDriverFactory
import io.healthplatform.pulsequery.database.createDatabase
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.testing.BaseComposeTest
import org.robolectric.Robolectric
import org.robolectric.RuntimeEnvironment
import org.robolectric.util.ReflectionHelpers
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Verifies Android platform detection, emulator host routing, file saving, database driver factory,
 * and [MainActivity] lifecycle under Robolectric.
 */
class AndroidPlatformAndActivityTest : BaseComposeTest() {

    /**
     * Verifies [AndroidPlatform], [getPlatform], [getDefaultLocalHost], and all emulator detection branches.
     */
    @Test
    fun testAndroidPlatformAndEmulatorBranches() {
        val platform = getPlatform()
        assertTrue(platform.name.startsWith("Android "))
        assertTrue(platform.description().startsWith("Running on Android "))

        // Pure helper branches for hasEmulatorBuildIdentity
        assertTrue(hasEmulatorBuildIdentity("generic_x86", "Pixel", "Google", "google", "pixel"))
        assertTrue(hasEmulatorBuildIdentity("unknown", "Pixel", "Google", "google", "pixel"))
        assertTrue(hasEmulatorBuildIdentity("release", "sdk_google_sdk_x86", "Google", "google", "pixel"))
        assertTrue(hasEmulatorBuildIdentity("release", "Android Emulator", "Google", "google", "pixel"))
        assertTrue(hasEmulatorBuildIdentity("release", "Android SDK built for x86", "Google", "google", "pixel"))
        assertTrue(hasEmulatorBuildIdentity("release", "Pixel", "Genymotion", "google", "pixel"))
        assertTrue(hasEmulatorBuildIdentity("release", "Pixel", "Google", "generic_brand", "generic_device"))
        assertFalse(hasEmulatorBuildIdentity("release", "Pixel", "Google", "generic_brand", "real_device"))
        assertFalse(hasEmulatorBuildIdentity("release", "Pixel 8", "Google", "google", "husky"))

        // Pure helper branches for hasEmulatorProductOrHardware
        assertTrue(hasEmulatorProductOrHardware("sdk_gphone64_arm64", "tensor"))
        assertTrue(hasEmulatorProductOrHardware("husky", "goldfish"))
        assertTrue(hasEmulatorProductOrHardware("husky", "ranchu"))
        assertFalse(hasEmulatorProductOrHardware("husky", "tensor"))

        // isRunningOnAndroidEmulator combinations
        assertTrue(isRunningOnAndroidEmulator(fingerprint = "generic", product = "husky", hardware = "tensor"))
        assertTrue(isRunningOnAndroidEmulator(fingerprint = "release", model = "Pixel", manufacturer = "Google", brand = "google", device = "husky", product = "sdk_gphone", hardware = "tensor"))
        assertFalse(isRunningOnAndroidEmulator(fingerprint = "release", model = "Pixel", manufacturer = "Google", brand = "google", device = "husky", product = "husky", hardware = "tensor"))
        assertFalse(isRunningOnAndroidEmulator(null, null, null, null, null, null, null))

        // Default arguments on isRunningOnAndroidEmulator and getDefaultLocalHost
        val origFingerprint = android.os.Build.FINGERPRINT
        val origProduct = android.os.Build.PRODUCT
        val origHardware = android.os.Build.HARDWARE
        val origModel = android.os.Build.MODEL
        val origManufacturer = android.os.Build.MANUFACTURER
        val origBrand = android.os.Build.BRAND
        val origDevice = android.os.Build.DEVICE
        try {
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "FINGERPRINT", "generic_x86")
            assertEquals("http://10.0.2.2:8000", getDefaultLocalHost())

            ReflectionHelpers.setStaticField(android.os.Build::class.java, "FINGERPRINT", "google/husky/husky:14")
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "MODEL", "Pixel 8 Pro")
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "MANUFACTURER", "Google")
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "BRAND", "google")
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "DEVICE", "husky")
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "PRODUCT", "husky")
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "HARDWARE", "tensor")
            assertEquals("http://localhost:8000", getDefaultLocalHost())
        } finally {
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "FINGERPRINT", origFingerprint)
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "PRODUCT", origProduct)
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "HARDWARE", origHardware)
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "MODEL", origModel)
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "MANUFACTURER", origManufacturer)
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "BRAND", origBrand)
            ReflectionHelpers.setStaticField(android.os.Build::class.java, "DEVICE", origDevice)
        }
    }

    /**
     * Verifies [resolveAndroidTargetDir] and [saveFileToDevice] across existing, creatable, null, and failing paths.
     */
    @Test
    fun testResolveAndroidTargetDirAndSaveFileToDevice() {
        val tempRoot = File.createTempFile("pq_android_dir_", "").apply {
            delete()
            mkdirs()
        }
        try {
            // 1. downloadsDir exists
            val existingDir = File(tempRoot, "existing").apply { mkdirs() }
            assertEquals(existingDir, resolveAndroidTargetDir(existingDir, tempRoot.absolutePath))

            // 2. downloadsDir does not exist but mkdirs() succeeds
            val creatableDir = File(tempRoot, "creatable")
            assertEquals(creatableDir, resolveAndroidTargetDir(creatableDir, tempRoot.absolutePath))
            assertTrue(creatableDir.exists())

            // 3. downloadsDir is null -> uses tmpDirProp
            assertEquals(tempRoot, resolveAndroidTargetDir(null, tempRoot.absolutePath))

            // 4. downloadsDir is null and tmpDirProp is null -> uses /tmp
            assertEquals(File("/tmp"), resolveAndroidTargetDir(null, null))

            // 5. downloadsDir does not exist and mkdirs() fails (parent is a regular file)
            val blockerFile = File(tempRoot, "blocker").apply { writeText("x") }
            val uncreatableDir = File(blockerFile, "child")
            assertEquals(tempRoot, resolveAndroidTargetDir(uncreatableDir, tempRoot.absolutePath))

            // 6. saveFileToDevice success
            val okRes = saveFileToDevice("export_test.csv", "text/csv", "a,b".encodeToByteArray())
            assertTrue(okRes.isSuccess)

            // 7. saveFileToDevice failure (invalid path with null/directory conflict)
            val failRes = saveFileToDevice("", "text/csv", "fail".encodeToByteArray())
            assertTrue(failRes.isFailure)
        } finally {
            tempRoot.deleteRecursively()
        }
    }

    /**
     * Verifies [AndroidDatabaseDriverFactory], [MainActivity], and [AppAndroidPreview].
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAndroidDatabaseDriverFactoryAndMainActivity() = runComposeUiTest {
        AppContainer.resetForTest()
        AppContainer.setHttpClientForTest(createMockClient())
        try {
            val context = RuntimeEnvironment.getApplication()
            val factory = AndroidDatabaseDriverFactory(context)
            val db = createDatabase(factory)
            assertNotNull(db)

            val controller = Robolectric.buildActivity(MainActivity::class.java).create()
            assertNotNull(controller.get())
            assertNotNull(AppContainer.keyValueStorage)

            setContent {
                MaterialTheme {
                    AppAndroidPreview()
                }
            }
        } finally {
            AppContainer.resetForTest()
        }
    }
}
