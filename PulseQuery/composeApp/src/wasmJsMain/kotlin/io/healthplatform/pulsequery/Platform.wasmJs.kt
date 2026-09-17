/**
 * Kotlin/Wasm Platform-specific implementation module for Pulse Query.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.core.error.PulseQueryError
import okio.ByteString.Companion.toByteString

/**
 * Represents the Web with Kotlin/Wasm execution platform metadata.
 *
 * @property name Human-readable platform descriptor for Kotlin/Wasm.
 */
class WasmPlatform : Platform {
    override val name: String = "Web with Kotlin/Wasm"
}

/**
 * Returns the current [WasmPlatform] execution environment instance.
 *
 * @return Active WebAssembly platform descriptor.
 */
actual fun getPlatform(): Platform = WasmPlatform()

/**
 * Returns the default localhost endpoint when running in a WebAssembly browser context.
 *
 * @return Local backend API base URL string.
 */
actual fun getDefaultLocalHost(): String = "http://localhost:8000"

/**
 * Executes a browser download using JavaScript DOM interop from Kotlin/Wasm.
 *
 * @param filename File name including extension.
 * @param mimeType Standard MIME type associated with the payload.
 * @param base64 Base64-encoded binary string representation of the payload.
 */
@JsFun(
    """(filename, mimeType, base64) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }"""
)
private external fun triggerWasmBrowserDownload(filename: String, mimeType: String, base64: String)

/**
 * Triggers a browser file download in WebAssembly using Base64 binary bridging to DOM.
 *
 * @param filename Target file name including extension.
 * @param mimeType Standard MIME type associated with the payload.
 * @param bytes Binary payload of the file.
 * @return [Result] containing download description or [PulseQueryError.Storage] on failure.
 */
actual fun saveFileToDevice(filename: String, mimeType: String, bytes: ByteArray): Result<String> {
    return runCatching {
        val base64 = bytes.toByteString().base64()
        triggerWasmBrowserDownload(filename, mimeType, base64)
        "Downloaded $filename ($mimeType)"
    }.recoverCatching { error ->
        throw PulseQueryError.Storage.WriteFailure(filename, "Wasm DOM", error)
    }
}
