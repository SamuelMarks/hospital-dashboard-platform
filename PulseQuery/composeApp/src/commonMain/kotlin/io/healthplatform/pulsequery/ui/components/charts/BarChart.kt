/**
 * Material 3 vertical Bar Chart Canvas visualization component module.
 */
package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.a11y_bar_chart_summary
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Formats a bar chart numeric value into a compact badge string (e.g. `110.8` or `76`).
 *
 * @param value Numeric value of the bar.
 * @return Compact display string for the bar value badge.
 */
internal fun formatBarValueBadge(value: Float): String {
    val roundedTenths = (value * 10f).roundToInt() / 10f
    return if (roundedTenths == roundedTenths.toInt().toFloat()) {
        roundedTenths.toInt().toString()
    } else {
        roundedTenths.toString()
    }
}

/**
 * A natively drawn Material 3 Bar Chart component.
 *
 * @param data List of Pair<Label, Value> representing the chart bars.
 * @param modifier Compose modifier for layout.
 * @param barColor Color of the bars, defaults to primary theme color.
 * @param labelColor Color for axis text labels.
 * @param textStyle Typography style for axis text labels.
 */
@Composable
fun BarChart(
    data: List<Pair<String, Float>>,
    modifier: Modifier = Modifier,
    barColor: Color = MaterialTheme.colorScheme.primary,
    labelColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    textStyle: TextStyle = MaterialTheme.typography.labelSmall
) {
    if (data.isEmpty()) return

    val textMeasurer: TextMeasurer = rememberTextMeasurer()
    val maxValue = max(data.maxOf { it.second }, 1f)
    val itemsSummary = data.joinToString(separator = ", ") { "${it.first}: ${it.second}" }
    val chartDescription = stringResource(Res.string.a11y_bar_chart_summary, data.size, itemsSummary)

    Canvas(
        modifier = modifier.fillMaxSize().padding(16.dp).semantics {
            contentDescription = chartDescription
        }
    ) {
        val canvasWidth = size.width
        val canvasHeight = size.height

        val barSpacing = 12.dp.toPx()
        val barWidth = max((canvasWidth - (barSpacing * (data.size - 1))) / data.size, 4.dp.toPx())
        val topReserve = 18.dp.toPx()
        val bottomReserve = 28.dp.toPx()
        val usableHeight = max(canvasHeight - topReserve - bottomReserve, 1f)

        data.forEachIndexed { index, pair ->
            val label = pair.first
            val value = pair.second

            // Calculate height proportional to max value
            val barHeight = (value / maxValue) * usableHeight

            val startX = index * (barWidth + barSpacing)
            val startY = canvasHeight - bottomReserve - barHeight

            // Draw Bar
            drawRoundRect(
                color = barColor,
                topLeft = Offset(startX, startY),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
            )

            // Draw Value Badge above Bar
            val valueBadgeResult = textMeasurer.measure(formatBarValueBadge(value), textStyle)
            val valueX = startX + (barWidth / 2) - (valueBadgeResult.size.width / 2)
            val valueY = max(0f, startY - valueBadgeResult.size.height - 2.dp.toPx())
            drawText(
                textLayoutResult = valueBadgeResult,
                color = labelColor,
                topLeft = Offset(valueX, valueY)
            )

            // Draw Label
            val textLayoutResult = textMeasurer.measure(label, textStyle)
            val textX = startX + (barWidth / 2) - (textLayoutResult.size.width / 2)
            val textY = canvasHeight - 20.dp.toPx()

            drawText(
                textLayoutResult = textLayoutResult,
                color = labelColor,
                topLeft = Offset(textX, textY)
            )
        }
    }
}
