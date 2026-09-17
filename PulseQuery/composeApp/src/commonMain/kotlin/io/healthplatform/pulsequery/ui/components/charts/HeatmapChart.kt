package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 2D Matrix Heatmap visualization component for hospital operational metrics.
 * Displays rows (Y-axis) against columns (X-axis) with cell background color gradient.
 *
 * @param columns List of column names (expects [Y, X, Value] order).
 * @param rows List of data rows matching [columns].
 * @param modifier Compose modifier for styling and layout.
 */
@Composable
fun HeatmapChart(
    columns: List<String>,
    rows: List<List<String>>,
    modifier: Modifier = Modifier
) {
    if (columns.size < 3 || rows.isEmpty()) {
        Box(
            modifier = modifier.fillMaxSize().padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Insufficient matrix dimensions for heatmap (requires at least 3 columns).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        return
    }

    val yLabels = rows.map { it.getOrElse(0) { "" } }.distinct()
    val xLabels = rows.map { it.getOrElse(1) { "" } }.distinct()

    val valueMap = mutableMapOf<Pair<String, String>, Float>()
    var minVal = Float.MAX_VALUE
    var maxVal = Float.MIN_VALUE

    for (row in rows) {
        val y = row.getOrElse(0) { "" }
        val x = row.getOrElse(1) { "" }
        val rawVal = row.getOrElse(2) { "0" }
        val numVal = rawVal.toFloatOrNull() ?: 0f

        valueMap[y to x] = numVal
        if (numVal < minVal) minVal = numVal
        if (numVal > maxVal) maxVal = numVal
    }

    if (minVal == Float.MAX_VALUE) minVal = 0f
    if (maxVal == Float.MIN_VALUE) maxVal = 0f
    val range = if (maxVal > minVal) maxVal - minVal else 1f

    val baseColor = MaterialTheme.colorScheme.surfaceVariant
    val targetColor = MaterialTheme.colorScheme.primary

    val hScroll = rememberScrollState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp)
            .semantics {
                contentDescription = "Heatmap matrix with ${yLabels.size} rows and ${xLabels.size} columns."
            }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(hScroll)
                .padding(bottom = 6.dp)
        ) {
            // Spacer for Y-axis labels column
            Box(modifier = Modifier.width(110.dp))

            // X-axis headers
            for (x in xLabels) {
                Box(
                    modifier = Modifier.width(68.dp).padding(horizontal = 2.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = x,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        maxLines = 1
                    )
                }
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .horizontalScroll(hScroll)
        ) {
            items(yLabels) { y ->
                Row(
                    modifier = Modifier.padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Row label
                    Box(
                        modifier = Modifier.width(110.dp).padding(end = 6.dp),
                        contentAlignment = Alignment.CenterStart
                    ) {
                        Text(
                            text = y,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1
                        )
                    }

                    // Matrix cells
                    for (x in xLabels) {
                        val valNum = valueMap[y to x] ?: 0f
                        val fraction = ((valNum - minVal) / range).coerceIn(0f, 1f)
                        val cellColor = lerp(baseColor, targetColor, fraction)

                        Box(
                            modifier = Modifier
                                .width(68.dp)
                                .height(42.dp)
                                .padding(2.dp)
                                .background(cellColor, RoundedCornerShape(4.dp))
                                .border(
                                    width = 0.5.dp,
                                    color = MaterialTheme.colorScheme.outlineVariant,
                                    shape = RoundedCornerShape(4.dp)
                                )
                                .semantics {
                                    contentDescription = "$y, $x: $valNum"
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = if (valNum % 1f == 0f) valNum.toInt().toString() else ((valNum * 10).toInt() / 10f).toString(),
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                fontWeight = FontWeight.SemiBold,
                                color = if (fraction > 0.6f) Color.White else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }
        }
    }
}
