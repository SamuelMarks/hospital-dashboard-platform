/**
 * iOS Platform-specific implementation module for Pulse Query.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.core.error.PulseQueryError
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Foundation.NSData
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
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
 * @param filename Target file name including extension.
 * @param mimeType Standard MIME type associated with the payload.
 * @param bytes Binary content of the file.
 * @return [Result] containing the absolute local file path on success, or exception on failure.
 */
@OptIn(ExperimentalForeignApi::class)
actual fun saveFileToDevice(filename: String, mimeType: String, bytes: ByteArray): Result<String> {
    val fileManager = NSFileManager.defaultManager
    val urls = fileManager.URLsForDirectory(NSDocumentDirectory, NSUserDomainMask)
    val docUrl = urls.firstOrNull() as? NSURL
    val directoryPath = docUrl?.path ?: return Result.failure(
        PulseQueryError.Storage.DirectoryNotFound("NSDocumentDirectory")
    )
    val fullPath = "$directoryPath/$filename"

    return runCatching {
        val nsData = if (bytes.isNotEmpty()) {
            bytes.usePinned { pinned ->
                NSData.create(bytes = pinned.addressOf(0), length = bytes.size.toULong())
            }
        } else {
            NSData()
        }

        val writeSuccess = nsData.writeToFile(fullPath, atomically = true)
        if (writeSuccess) {
            fullPath
        } else {
            throw PulseQueryError.Storage.WriteFailure(filename, fullPath)
        }
    }.recoverCatching { error ->
        throw PulseQueryError.Storage.WriteFailure(filename, fullPath, error)
    }
}
