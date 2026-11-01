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
 * Resolves the writable target directory for iOS file exports, preferring [baseDir] when it
 * exists or can be created via [createDir], and falling back to [tempDirProvider].
 *
 * @param baseDir Optional Documents directory path.
 * @param dirExists Predicate checking whether a directory path already exists.
 * @param createDir Function attempting to create the directory path, returning true on success.
 * @param tempDirProvider Supplier returning the fallback temporary directory path.
 * @return Resolved target directory path string.
 */
internal fun resolveIosTargetDir(
    baseDir: String?,
    dirExists: (String) -> Boolean,
    createDir: (String) -> Boolean,
    tempDirProvider: () -> String = { NSTemporaryDirectory() }
): String {
    return if (baseDir != null) {
        if (!dirExists(baseDir)) {
            if (createDir(baseDir)) baseDir else tempDirProvider()
        } else {
            baseDir
        }
    } else {
        tempDirProvider()
    }
}

/**
 * Converts a [ByteArray] into an iOS [NSData] buffer.
 *
 * @param bytes Binary payload to wrap.
 * @return Constructed [NSData] instance.
 */
@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
internal fun ByteArray.toNsData(): NSData {
    return if (isNotEmpty()) {
        usePinned { pinned ->
            NSData.create(bytes = pinned.addressOf(0), length = size.toULong())
        }
    } else {
        NSData()
    }
}

/**
 * Executes the iOS file write workflow with automatic fallback to [tempDir] when the primary
 * destination fails to write.
 *
 * @param filename Target file name including extension.
 * @param targetDir Primary target directory path.
 * @param tempDir Fallback temporary directory path.
 * @param writer Function writing to a resolved file path and returning true on success.
 * @return [Result] containing the final written path on success, or [PulseQueryError.Storage.WriteFailure] on failure.
 */
internal fun writeIosPayloadWithFallback(
    filename: String,
    targetDir: String,
    tempDir: String = NSTemporaryDirectory(),
    writer: (String) -> Boolean
): Result<String> {
    val targetDirPath = targetDir.trimEnd('/')
    val fullPath = "$targetDirPath/$filename"

    return runCatching {
        var writeSuccess = writer(fullPath)
        var finalPath = fullPath
        val normalizedTempDir = tempDir.trimEnd('/')
        if (!writeSuccess && targetDirPath != normalizedTempDir) {
            val fallbackPath = "$normalizedTempDir/$filename"
            writeSuccess = writer(fallbackPath)
            if (writeSuccess) {
                finalPath = fallbackPath
            }
        }

        if (writeSuccess) {
            Result.success(finalPath)
        } else {
            Result.failure(PulseQueryError.Storage.WriteFailure(filename, finalPath))
        }
    }.fold(
        onSuccess = { it },
        onFailure = { error ->
            Result.failure(PulseQueryError.Storage.WriteFailure(filename, fullPath, error))
        }
    )
}

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

    val targetDir = resolveIosTargetDir(
        baseDir = baseDir,
        dirExists = { fileManager.fileExistsAtPath(it) },
        createDir = {
            fileManager.createDirectoryAtPath(
                path = it,
                withIntermediateDirectories = true,
                attributes = null,
                error = null
            )
        }
    )

    val nsData = bytes.toNsData()
    return writeIosPayloadWithFallback(
        filename = filename,
        targetDir = targetDir,
        writer = { path -> nsData.writeToFile(path, atomically = true) }
    )
}
