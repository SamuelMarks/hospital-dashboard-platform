/**
 * SQL-to-visualization compatibility validation engine (`VizCompatibilityValidator.kt`).
 *
 * Evaluates whether a SQL result schema and dataset (`columns` and `rows`) are applicable
 * to a requested [VisualizationType], returning a strongly typed [Result] without throwing exceptions.
 */
package io.healthplatform.pulsequery.core.model

import io.healthplatform.pulsequery.core.error.PulseQueryError

/**
 * Enumerated machine-readable reasons why a SQL dataset is not applicable to a visualization.
 */
enum class VizIncompatibilityReason {
    /** Pie chart requires at least 2 columns (category label and numeric size). */
    TOO_FEW_COLUMNS_PIE,

    /** Pie chart value column contains no finite numeric values. */
    NON_NUMERIC_VALUES_PIE,

    /** Pie chart value column contains negative numbers. */
    NEGATIVE_VALUES_PIE,

    /** Pie chart value column sums to 0 or less. */
    ZERO_TOTAL_PIE,

    /** Bar chart requires at least 2 columns (X-axis category and numeric Y-axis). */
    TOO_FEW_COLUMNS_BAR,

    /** Bar or line chart Y-axis column contains only non-numeric text values. */
    NON_NUMERIC_Y_AXIS,

    /** Line chart requires at least 2 columns (X-axis and numeric Y-axis). */
    TOO_FEW_COLUMNS_LINE,

    /** Line chart requires at least 2 rows to plot a trend line. */
    SINGLE_ROW_LINE,

    /** Heatmap requires at least 3 columns (Y category, X bucket, and numeric intensity). */
    INSUFFICIENT_COLUMNS_HEATMAP,

    /** Heatmap intensity column contains no finite numeric values. */
    NON_NUMERIC_HEATMAP,

    /** Scalar gauge requires at least one numeric cell in the first row. */
    NON_NUMERIC_SCALAR,

    /** Configured xKey or yKey column is missing from the SQL result columns. */
    MISSING_AXIS_COLUMN,

    /** Markdown visualization is not applicable to SQL query results. */
    SQL_NOT_APPLICABLE_TO_MARKDOWN
}

/**
 * Structured validation report returned by [VizCompatibilityValidator.validateSqlResultForVisualization].
 *
 * @property visualization Resolved canonical [VisualizationType].
 * @property isCompatible True if the SQL dataset is applicable to [visualization].
 * @property reason Optional [VizIncompatibilityReason] when [isCompatible] is false.
 * @property suggestedVisualizations Recommended alternative [VisualizationType] options.
 */
data class VizValidationReport(
    val visualization: VisualizationType,
    val isCompatible: Boolean,
    val reason: VizIncompatibilityReason? = null,
    val suggestedVisualizations: List<VisualizationType> = emptyList()
)

/**
 * Pure, exception-free validator checking SQL query result compatibility with dashboard visualizations.
 */
object VizCompatibilityValidator {

    /**
     * Parses a raw cell string (including percentage strings like `"-12.5%"`) into a finite [Double], or null.
     *
     * @param raw Raw cell string.
     * @return Finite [Double] or null if non-numeric.
     */
    fun parseFiniteNumber(raw: String?): Double? {
        if (raw == null) return null
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        val cleaned = if (trimmed.endsWith("%")) trimmed.dropLast(1).trim() else trimmed
        if (cleaned.isEmpty()) return null
        val num = cleaned.toDoubleOrNull() ?: return null
        return if (num.isFinite()) num else null
    }

    /**
     * Validates whether a SQL result table (`[columns]` and `[rows]`) is applicable to `[visualization]`.
     *
     * Returns `Result.success(VizValidationReport)` when compatible, or
     * `Result.failure(PulseQueryError.Http.BadRequest)` when an explicit axis override (`[xKey]` / `[yKey]`)
     * is missing or when `[visualization]` is incompatible with the SQL dataset.
     *
     * @param visualization Raw visualization identifier string.
     * @param columns Ordered list of SQL result column names.
     * @param rows Tabular row values corresponding to [columns].
     * @param xKey Optional explicit X-axis column name override.
     * @param yKey Optional explicit Y-axis column name override.
     * @return [Result] wrapping [VizValidationReport] on compatibility, or [PulseQueryError] on incompatibility.
     */
    fun validateSqlResultForVisualization(
        visualization: String,
        columns: List<String>,
        rows: List<List<String>>,
        xKey: String? = null,
        yKey: String? = null
    ): Result<VizValidationReport> {
        val vizType = VisualizationType.fromWire(visualization)
        if (vizType == VisualizationType.MARKDOWN) {
            return buildIncompatibleFailure(
                vizType = vizType,
                reason = VizIncompatibilityReason.SQL_NOT_APPLICABLE_TO_MARKDOWN,
                suggested = listOf(VisualizationType.TABLE, VisualizationType.METRIC)
            )
        }
        if (columns.isEmpty()) {
            return Result.success(
                VizValidationReport(
                    visualization = vizType,
                    isCompatible = true,
                    suggestedVisualizations = listOf(vizType)
                )
            )
        }
        if (hasMissingAxisOverride(columns, xKey, yKey)) {
            return buildIncompatibleFailure(
                vizType = vizType,
                reason = VizIncompatibilityReason.MISSING_AXIS_COLUMN,
                suggested = listOf(VisualizationType.TABLE)
            )
        }
        return dispatchVizValidation(vizType, columns, rows, yKey)
    }

    /**
     * Checks whether an explicit [xKey] or [yKey] axis override is absent from [columns].
     *
     * @param columns Ordered SQL result column names.
     * @param xKey Optional X-axis column name override.
     * @param yKey Optional Y-axis column name override.
     * @return True if either override is non-blank and missing from [columns].
     */
    private fun hasMissingAxisOverride(
        columns: List<String>,
        xKey: String?,
        yKey: String?
    ): Boolean =
        (!xKey.isNullOrBlank() && xKey !in columns) || (!yKey.isNullOrBlank() && yKey !in columns)

    /**
     * Dispatches dataset validation to the visualization-specific validator for [vizType].
     *
     * @param vizType Canonical [VisualizationType] to validate.
     * @param columns Ordered SQL result column names.
     * @param rows Tabular data rows.
     * @param yKey Optional explicit Y-axis column name override.
     * @return Validation [Result].
     */
    private fun dispatchVizValidation(
        vizType: VisualizationType,
        columns: List<String>,
        rows: List<List<String>>,
        yKey: String?
    ): Result<VizValidationReport> = when (vizType) {
        VisualizationType.PIE_CHART -> validatePie(columns, rows, yKey)
        VisualizationType.BAR_CHART -> validateBar(columns, rows, yKey)
        VisualizationType.LINE_CHART -> validateLine(columns, rows, yKey)
        VisualizationType.HEATMAP -> validateHeatmap(columns, rows, yKey)
        VisualizationType.SCALAR -> validateScalar(rows)
        else ->
            Result.success(
                VizValidationReport(
                    visualization = vizType,
                    isCompatible = true,
                    suggestedVisualizations = listOf(vizType, VisualizationType.TABLE).distinct()
                )
            )
    }

    /**
     * Resolves the numeric value column index from [yKey] or by inspecting [rows].
     *
     * @param columns Ordered column names.
     * @param rows Tabular data rows (non-empty).
     * @param yKey Optional explicit Y-axis column override (already verified present in [columns]).
     * @return Zero-based column index.
     */
    private fun resolveValueColumnIndex(
        columns: List<String>,
        rows: List<List<String>>,
        yKey: String?
    ): Int {
        if (!yKey.isNullOrBlank()) {
            return columns.indexOf(yKey)
        }
        val firstRow = rows.first()
        return (1 until columns.size).firstOrNull { idx ->
            parseFiniteNumber(firstRow.getOrNull(idx)) != null
        } ?: 1
    }

    /**
     * Validates a SQL dataset for [VisualizationType.PIE_CHART].
     *
     * @param columns Dataset column names.
     * @param rows Dataset rows.
     * @param yKey Optional Y-axis column override.
     * @return Validation [Result].
     */
    private fun validatePie(
        columns: List<String>,
        rows: List<List<String>>,
        yKey: String?
    ): Result<VizValidationReport> {
        if (columns.size < 2) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.PIE_CHART,
                reason = VizIncompatibilityReason.TOO_FEW_COLUMNS_PIE,
                suggested = listOf(VisualizationType.METRIC, VisualizationType.SCALAR, VisualizationType.TABLE)
            )
        }
        if (rows.isEmpty()) {
            return Result.success(
                VizValidationReport(
                    visualization = VisualizationType.PIE_CHART,
                    isCompatible = true,
                    suggestedVisualizations = listOf(VisualizationType.PIE_CHART, VisualizationType.TABLE)
                )
            )
        }
        val valIdx = resolveValueColumnIndex(columns, rows, yKey)
        val nums = rows.mapNotNull { parseFiniteNumber(it.getOrNull(valIdx)) }
        if (nums.isEmpty()) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.PIE_CHART,
                reason = VizIncompatibilityReason.NON_NUMERIC_VALUES_PIE,
                suggested = listOf(VisualizationType.TABLE)
            )
        }
        if (nums.any { it < 0.0 }) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.PIE_CHART,
                reason = VizIncompatibilityReason.NEGATIVE_VALUES_PIE,
                suggested = listOf(VisualizationType.BAR_CHART, VisualizationType.TABLE)
            )
        }
        if (nums.sum() <= 0.0) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.PIE_CHART,
                reason = VizIncompatibilityReason.ZERO_TOTAL_PIE,
                suggested = listOf(VisualizationType.TABLE, VisualizationType.BAR_CHART)
            )
        }
        return Result.success(
            VizValidationReport(
                visualization = VisualizationType.PIE_CHART,
                isCompatible = true,
                suggestedVisualizations = listOf(VisualizationType.PIE_CHART, VisualizationType.BAR_CHART, VisualizationType.TABLE)
            )
        )
    }

    /**
     * Validates a SQL dataset for [VisualizationType.BAR_CHART].
     *
     * @param columns Dataset column names.
     * @param rows Dataset rows.
     * @param yKey Optional Y-axis column override.
     * @return Validation [Result].
     */
    private fun validateBar(
        columns: List<String>,
        rows: List<List<String>>,
        yKey: String?
    ): Result<VizValidationReport> {
        if (columns.size < 2) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.BAR_CHART,
                reason = VizIncompatibilityReason.TOO_FEW_COLUMNS_BAR,
                suggested = listOf(VisualizationType.METRIC, VisualizationType.SCALAR, VisualizationType.TABLE)
            )
        }
        if (rows.isEmpty()) {
            return Result.success(
                VizValidationReport(
                    visualization = VisualizationType.BAR_CHART,
                    isCompatible = true,
                    suggestedVisualizations = listOf(VisualizationType.BAR_CHART, VisualizationType.TABLE)
                )
            )
        }
        val valIdx = resolveValueColumnIndex(columns, rows, yKey)
        if (rows.none { parseFiniteNumber(it.getOrNull(valIdx)) != null }) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.BAR_CHART,
                reason = VizIncompatibilityReason.NON_NUMERIC_Y_AXIS,
                suggested = listOf(VisualizationType.TABLE)
            )
        }
        return Result.success(
            VizValidationReport(
                visualization = VisualizationType.BAR_CHART,
                isCompatible = true,
                suggestedVisualizations = listOf(VisualizationType.BAR_CHART, VisualizationType.LINE_CHART, VisualizationType.TABLE)
            )
        )
    }

    /**
     * Validates a SQL dataset for [VisualizationType.LINE_CHART].
     *
     * @param columns Dataset column names.
     * @param rows Dataset rows.
     * @param yKey Optional Y-axis column override.
     * @return Validation [Result].
     */
    private fun validateLine(
        columns: List<String>,
        rows: List<List<String>>,
        yKey: String?
    ): Result<VizValidationReport> {
        if (columns.size < 2) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.LINE_CHART,
                reason = VizIncompatibilityReason.TOO_FEW_COLUMNS_LINE,
                suggested = listOf(VisualizationType.METRIC, VisualizationType.SCALAR, VisualizationType.TABLE)
            )
        }
        if (rows.isEmpty()) {
            return Result.success(
                VizValidationReport(
                    visualization = VisualizationType.LINE_CHART,
                    isCompatible = true,
                    suggestedVisualizations = listOf(VisualizationType.LINE_CHART, VisualizationType.TABLE)
                )
            )
        }
        val valIdx = resolveValueColumnIndex(columns, rows, yKey)
        if (rows.none { parseFiniteNumber(it.getOrNull(valIdx)) != null }) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.LINE_CHART,
                reason = VizIncompatibilityReason.NON_NUMERIC_Y_AXIS,
                suggested = listOf(VisualizationType.TABLE)
            )
        }
        if (rows.size < 2) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.LINE_CHART,
                reason = VizIncompatibilityReason.SINGLE_ROW_LINE,
                suggested = listOf(VisualizationType.METRIC, VisualizationType.SCALAR, VisualizationType.BAR_CHART, VisualizationType.TABLE)
            )
        }
        return Result.success(
            VizValidationReport(
                visualization = VisualizationType.LINE_CHART,
                isCompatible = true,
                suggestedVisualizations = listOf(VisualizationType.LINE_CHART, VisualizationType.BAR_CHART, VisualizationType.TABLE)
            )
        )
    }

    /**
     * Validates a SQL dataset for [VisualizationType.HEATMAP].
     *
     * @param columns Dataset column names.
     * @param rows Dataset rows.
     * @param yKey Optional Y-axis column override.
     * @return Validation [Result].
     */
    private fun validateHeatmap(
        columns: List<String>,
        rows: List<List<String>>,
        yKey: String?
    ): Result<VizValidationReport> {
        if (columns.size < 3) {
            val suggested = if (columns.size == 2) {
                listOf(VisualizationType.BAR_CHART, VisualizationType.PIE_CHART, VisualizationType.TABLE)
            } else {
                listOf(VisualizationType.METRIC, VisualizationType.SCALAR, VisualizationType.TABLE)
            }
            return buildIncompatibleFailure(
                vizType = VisualizationType.HEATMAP,
                reason = VizIncompatibilityReason.INSUFFICIENT_COLUMNS_HEATMAP,
                suggested = suggested
            )
        }
        if (rows.isEmpty()) {
            return Result.success(
                VizValidationReport(
                    visualization = VisualizationType.HEATMAP,
                    isCompatible = true,
                    suggestedVisualizations = listOf(VisualizationType.HEATMAP, VisualizationType.TABLE)
                )
            )
        }
        val explicitIdx = if (!yKey.isNullOrBlank()) columns.indexOf(yKey) else null
        val bottleneckIdx = (2 until columns.size).firstOrNull { idx ->
            columns[idx].equals("net_bottleneck", ignoreCase = true)
        }
        val valIdx = explicitIdx ?: bottleneckIdx ?: if (columns.size > 3) columns.lastIndex else 2
        if (rows.none { parseFiniteNumber(it.getOrNull(valIdx)) != null }) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.HEATMAP,
                reason = VizIncompatibilityReason.NON_NUMERIC_HEATMAP,
                suggested = listOf(VisualizationType.TABLE)
            )
        }
        return Result.success(
            VizValidationReport(
                visualization = VisualizationType.HEATMAP,
                isCompatible = true,
                suggestedVisualizations = listOf(VisualizationType.HEATMAP, VisualizationType.TABLE)
            )
        )
    }

    /**
     * Validates a SQL dataset for [VisualizationType.SCALAR].
     *
     * @param rows Dataset rows.
     * @return Validation [Result].
     */
    private fun validateScalar(rows: List<List<String>>): Result<VizValidationReport> {
        val firstRow = rows.firstOrNull()
        if (firstRow != null && firstRow.none { parseFiniteNumber(it) != null }) {
            return buildIncompatibleFailure(
                vizType = VisualizationType.SCALAR,
                reason = VizIncompatibilityReason.NON_NUMERIC_SCALAR,
                suggested = listOf(VisualizationType.TABLE)
            )
        }
        return Result.success(
            VizValidationReport(
                visualization = VisualizationType.SCALAR,
                isCompatible = true,
                suggestedVisualizations = listOf(VisualizationType.SCALAR, VisualizationType.METRIC, VisualizationType.TABLE)
            )
        )
    }

    /**
     * Constructs a failed [Result] wrapping a [PulseQueryError.Http.BadRequest] with the [reason] name.
     *
     * @param vizType Target [VisualizationType].
     * @param reason Specific [VizIncompatibilityReason].
     * @param suggested Recommended alternative visualizations.
     * @return Failed [Result].
     */
    private fun buildIncompatibleFailure(
        vizType: VisualizationType,
        reason: VizIncompatibilityReason,
        suggested: List<VisualizationType>
    ): Result<VizValidationReport> {
        val sugNames = suggested.joinToString(",") { it.wireValue }
        return Result.failure(
            PulseQueryError.Http.BadRequest(
                details = "${vizType.wireValue}:${reason.name}:$sugNames"
            )
        )
    }
}
