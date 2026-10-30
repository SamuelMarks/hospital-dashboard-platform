/**
 * Dashboard Export Helper module providing cross-platform file export actions
 * returning typed [Result] and [PulseQueryError] instances.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.core.result.flatMap
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.call.body
import io.ktor.client.statement.bodyAsText

/**
 * Immutable artifact payload returned from a successful dashboard export operation.
 *
 * @property format Target file format ("json", "csv", or "pdf").
 * @property content Raw text content of the exported dashboard.
 * @property bytes Raw binary bytes for binary exports like PDF.
 * @property filename Recommended filename for saving the exported artifact.
 * @property mimeType Standard MIME type associated with the exported content.
 */
class DashboardExportArtifact(
    val format: String,
    val content: String = "",
    val bytes: ByteArray = ByteArray(0),
    val filename: String = "",
    val mimeType: String = "application/json"
)

/**
 * Helper object providing export capabilities for Dashboards in JSON, CSV, and PDF formats.
 */
object DashboardExportHelper {
    /**
     * Fetches the exported dashboard data from the backend API wrapped in a [Result].
     *
     * @param dashboardId The UUID of the dashboard to export.
     * @param format Export format: "json" or "csv".
     * @param dashboardsApi Optional [DashboardsApi] override (defaults to [AppContainer.dashboardsApi]).
     * @return [Result] containing [DashboardExportArtifact] on success or [PulseQueryError] on failure.
     */
    suspend fun exportDashboard(
        dashboardId: String,
        format: String = "json",
        dashboardsApi: DashboardsApi = AppContainer.dashboardsApi
    ): Result<DashboardExportArtifact> {
        return runCatchingPulseAsync {
            val response = dashboardsApi
                .exportDashboardApiV1DashboardsDashboardIdExportGet(dashboardId, format)
            if (!response.success) {
                Result.failure(
                    PulseQueryError.fromHttpStatus(
                        response.status,
                        "Export failed with HTTP ${response.status}"
                    )
                )
            } else {
                val content = response.response.bodyAsText()
                val isCsv = format.equals("csv", ignoreCase = true)
                val extension = if (isCsv) "csv" else "json"
                val mime = if (isCsv) "text/csv" else "application/json"
                val filename = "dashboard-$dashboardId.$extension"

                Result.success(
                    DashboardExportArtifact(
                        format = format,
                        content = content,
                        bytes = content.encodeToByteArray(),
                        filename = filename,
                        mimeType = mime
                    )
                )
            }
        }.flatMap { it }
    }

    /**
     * Fetches the exported dashboard clinical PDF report from the backend API wrapped in a [Result].
     *
     * @param dashboardId The UUID of the dashboard to export as a formatted clinical PDF.
     * @param dashboardsApi Optional [DashboardsApi] override (defaults to [AppContainer.dashboardsApi]).
     * @return [Result] containing binary [DashboardExportArtifact] on success or [PulseQueryError] on failure.
     */
    suspend fun exportDashboardPdf(
        dashboardId: String,
        dashboardsApi: DashboardsApi = AppContainer.dashboardsApi
    ): Result<DashboardExportArtifact> {
        return runCatchingPulseAsync {
            val response = dashboardsApi
                .exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet(dashboardId)
            if (!response.success) {
                Result.failure(
                    PulseQueryError.fromHttpStatus(
                        response.status,
                        "PDF export failed with HTTP ${response.status}"
                    )
                )
            } else {
                val bytes = response.response.body<ByteArray>()
                val filename = "clinical-report-$dashboardId.pdf"

                Result.success(
                    DashboardExportArtifact(
                        format = "pdf",
                        bytes = bytes,
                        filename = filename,
                        mimeType = "application/pdf"
                    )
                )
            }
        }.flatMap { it }
    }

    /**
     * Persists or stages exported content into the local application storage.
     *
     * @param filename Target filename.
     * @param content Exported payload string.
     * @return [Result] of [Unit] on success, or a [PulseQueryError.Storage.WriteFailure] on failure.
     */
    fun saveExportedFile(filename: String, content: String): Result<Unit> {
        val storageResult = AppContainer.keyValueStorage?.saveResult("export_$filename", content)
            ?: Result.success(Unit)
        return storageResult.fold(
            onSuccess = { Result.success(Unit) },
            onFailure = { error ->
                Result.failure(PulseQueryError.Storage.WriteFailure(filename, "keyValueStorage", error))
            }
        )
    }
}
