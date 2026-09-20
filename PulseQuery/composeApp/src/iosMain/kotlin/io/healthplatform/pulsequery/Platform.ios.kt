/**
 * iOS Platform-specific implementation module for Pulse Query.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.core.error.PulseQueryError
import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Foundation.NSData
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSURL
import platform.Foundation.NSUserDomainMask
import platform.Foundation.create
import platform.Foundation.writeToFile
import platform.UIKit.UIDevice

/**
 * Represents the iOS execution platform metadata.
 *
 * @property name System name and operating system version of the iOS device.
 */
class IOSPlatform : Platform {
    override val name: String = UIDevice.currentDevice.systemName() + " " + UIDevice.currentDevice.systemVersion
}

/**
 * Returns the current [IOSPlatform] execution environment instance.
 *
 * @return Active iOS platform descriptor.
 */
actual fun getPlatform(): Platform = IOSPlatform()

/**
 * Returns the default localhost endpoint when running in the iOS Simulator.
 *
 * @return Local backend API base URL string.
 */
actual fun getDefaultLocalHost(): String = "http://localhost:8000"

/**
 * Persists a binary file payload into the iOS app's standard Documents directory.
 *
 * Ensures intermediate directories are created if the destination directory does not yet exist.
 * Falls back to the temporary directory if the Documents directory cannot be accessed or written to.
 *
 * @param filename Target file name including extension.
 * @param mimeType Standard MIME type associated with the payload.
 * @param bytes Binary content of the file.
 * @return [Result] containing the absolute local file path on success, or exception on failure.
 */
@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
actual fun saveFileToDevice(filename: String, mimeType: String, bytes: ByteArray): Result<String> {
    val fileManager = NSFileManager.defaultManager
    val urls = fileManager.URLsForDirectory(NSDocumentDirectory, NSUserDomainMask)
    val docUrl = urls.firstOrNull() as? NSURL
    val baseDir = docUrl?.path

    val targetDir = if (baseDir != null) {
        if (!fileManager.fileExistsAtPath(baseDir)) {
            val created = fileManager.createDirectoryAtPath(
                path = baseDir,
                withIntermediateDirectories = true,
                attributes = null,
                error = null
            )
            if (created) baseDir else NSTemporaryDirectory()
        } else {
            baseDir
        }
    } else {
        NSTemporaryDirectory()
    }

    val targetDirPath = targetDir.trimEnd('/')
    val fullPath = "$targetDirPath/$filename"

    return runCatching {
        val nsData = if (bytes.isNotEmpty()) {
            bytes.usePinned { pinned ->
                NSData.create(bytes = pinned.addressOf(0), length = bytes.size.toULong())
            }
        } else {
            NSData()
        }

        var writeSuccess = nsData.writeToFile(fullPath, atomically = true)
        var finalPath = fullPath
        val tempDir = NSTemporaryDirectory().trimEnd('/')
        if (!writeSuccess && targetDirPath != tempDir) {
            val fallbackPath = "$tempDir/$filename"
            writeSuccess = nsData.writeToFile(fallbackPath, atomically = true)
            if (writeSuccess) {
                finalPath = fallbackPath
            }
        }

        if (writeSuccess) {
            finalPath
        } else {
            throw PulseQueryError.Storage.WriteFailure(filename, finalPath)
        }
    }.recoverCatching { error ->
        throw PulseQueryError.Storage.WriteFailure(filename, fullPath, error)
    }
}
