/**
 * Dashboard Export Helper module providing cross-platform file export actions.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.call.body
import io.ktor.client.statement.bodyAsText

/**
 * Result returned from a dashboard export operation.
 *
 * @property success True if export payload was successfully retrieved.
 * @property format Target file format ("json", "csv", or "pdf").
 * @property content Raw text content of the exported dashboard.
 * @property bytes Raw binary bytes for binary exports like PDF.
 * @property filename Recommended filename for saving the exported artifact.
 * @property mimeType Standard MIME type associated with the exported content.
 * @property errorMessage Error text if export failed.
 */
data class DashboardExportResult(
    val success: Boolean,
    val format: String,
    val content: String = "",
    val bytes: ByteArray = ByteArray(0),
    val filename: String = "",
    val mimeType: String = "application/json",
    val errorMessage: String? = null
)

/**
 * Helper object providing export capabilities for Dashboards in JSON, CSV, and PDF formats.
 */
object DashboardExportHelper {

    /**
     * Fetches the exported dashboard data from the backend API.
     *
     * @param dashboardId The UUID of the dashboard to export.
     * @param format Export format: "json" or "csv".
     * @return [DashboardExportResult] containing exported content and metadata.
     */
    suspend fun exportDashboard(
        dashboardId: String,
        format: String = "json"
    ): DashboardExportResult {
        return runCatching {
            val response = AppContainer.dashboardsApi
                .exportDashboardApiV1DashboardsDashboardIdExportGet(dashboardId, format)
            if (!response.success) {
                return@runCatching DashboardExportResult(
                    success = false,
                    format = format,
                    errorMessage = "Export failed with HTTP ${response.status}"
                )
            }
            val content = response.response.bodyAsText()
            val isCsv = format.equals("csv", ignoreCase = true)
            val extension = if (isCsv) "csv" else "json"
            val mime = if (isCsv) "text/csv" else "application/json"
            val filename = "dashboard-$dashboardId.$extension"

            DashboardExportResult(
                success = true,
                format = format,
                content = content,
                bytes = content.encodeToByteArray(),
                filename = filename,
                mimeType = mime
            )
        }.getOrElse { e ->
            DashboardExportResult(
                success = false,
                format = format,
                errorMessage = e.message ?: "Failed to export dashboard"
            )
        }
    }

    /**
     * Fetches the exported dashboard clinical PDF report from the backend API.
     *
     * @param dashboardId The UUID of the dashboard to export as a formatted clinical PDF.
     * @return [DashboardExportResult] containing binary PDF bytes and metadata.
     */
    suspend fun exportDashboardPdf(
        dashboardId: String
    ): DashboardExportResult {
        return runCatching {
            val response = AppContainer.dashboardsApi
                .exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet(dashboardId)
            if (!response.success) {
                return@runCatching DashboardExportResult(
                    success = false,
                    format = "pdf",
                    errorMessage = "PDF export failed with HTTP ${response.status}"
                )
            }
            val bytes = response.response.body<ByteArray>()
            val filename = "clinical-report-$dashboardId.pdf"

            DashboardExportResult(
                success = true,
                format = "pdf",
                bytes = bytes,
                filename = filename,
                mimeType = "application/pdf"
            )
        }.getOrElse { e ->
            DashboardExportResult(
                success = false,
                format = "pdf",
                errorMessage = e.message ?: "Failed to export dashboard PDF"
            )
        }
    }

    /**
     * Persists or stages exported content into the local application storage.
     *
     * @param filename Target filename.
     * @param content Raw string data.
     * @return [Result] indicating success or failure.
     */
    fun saveExportedFile(filename: String, content: String): Result<Unit> {
        return runCatching {
            AppContainer.keyValueStorage?.save("export_$filename", content)
            Unit
        }.recoverCatching { error ->
            throw PulseQueryError.Storage.WriteFailure(filename, "keyValueStorage", error)
        }
    }
}
