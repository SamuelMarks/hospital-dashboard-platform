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
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import kotlin.math.max

/**
 * A natively drawn Material 3 Bar Chart component.
 *
 * @param data List of Pair<Label, Value> representing the chart bars.
 * @param modifier Compose modifier for layout.
 * @param barColor Color of the bars, defaults to primary theme color.
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

    Canvas(
        modifier = modifier.fillMaxSize().padding(16.dp)
    ) {
        val canvasWidth = size.width
        val canvasHeight = size.height

        val barSpacing = 16.dp.toPx()
        val barWidth = (canvasWidth - (barSpacing * (data.size - 1))) / data.size

        data.forEachIndexed { index, pair ->
            val label = pair.first
            val value = pair.second

            // Calculate height proportional to max value
            val barHeight = (value / maxValue) * (canvasHeight - 30.dp.toPx()) // Reserve bottom 30dp for label
            
            val startX = index * (barWidth + barSpacing)
            val startY = canvasHeight - 30.dp.toPx() - barHeight

            // Draw Bar
            drawRoundRect(
                color = barColor,
                topLeft = Offset(startX, startY),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
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
