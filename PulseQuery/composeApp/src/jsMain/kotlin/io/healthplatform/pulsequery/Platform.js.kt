/**
 * Kotlin/JS Platform-specific implementation module for Pulse Query.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.core.error.PulseQueryError
import kotlinx.browser.document
import org.khronos.webgl.Int8Array
import org.w3c.dom.HTMLAnchorElement
import org.w3c.dom.url.URL
import org.w3c.files.Blob
import org.w3c.files.BlobPropertyBag

/**
 * Represents the Kotlin/JS execution platform environment metadata.
 *
 * @property name Human-readable platform descriptor for Kotlin/JS.
 */
class JsPlatform : Platform {
    override val name: String = "Web with Kotlin/JS"
}

/**
 * Returns the current [JsPlatform] execution environment instance.
 *
 * @return Active JavaScript platform descriptor.
 */
actual fun getPlatform(): Platform = JsPlatform()

/**
 * Returns the default localhost endpoint when running in a web browser.
 *
 * @return Local backend API base URL string.
 */
actual fun getDefaultLocalHost(): String = "http://localhost:8000"

/**
 * Triggers a browser file download using DOM Blob construction and an anchor click dispatch.
 *
 * @param filename Target file name including extension.
 * @param mimeType Standard MIME type associated with the payload.
 * @param bytes Binary payload of the file.
 * @return [Result] containing download description or [PulseQueryError.Storage] on failure.
 */
actual fun saveFileToDevice(filename: String, mimeType: String, bytes: ByteArray): Result<String> {
    return runCatching {
        val int8Array = Int8Array(bytes.toTypedArray())
        val blob = Blob(arrayOf(int8Array), BlobPropertyBag(type = mimeType))
        val objectUrl = URL.createObjectURL(blob)
        val anchor = document.createElement("a") as HTMLAnchorElement
        anchor.href = objectUrl
        anchor.download = filename
        document.body?.appendChild(anchor)
        anchor.click()
        document.body?.removeChild(anchor)
        URL.revokeObjectURL(objectUrl)
        "Downloaded $filename ($mimeType)"
    }.recoverCatching { error ->
        throw PulseQueryError.Storage.WriteFailure(filename, "DOM Blob", error)
    }
}
