package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import kotlin.math.max

/**
 * A natively drawn Material 3 Line Chart component.
 *
 * @param data List of Pair<Label, Value> representing the data points.
 * @param modifier Compose modifier for layout.
 * @param lineColor Color of the line, defaults to primary theme color.
 */
@Composable
fun LineChart(
    data: List<Pair<String, Float>>,
    modifier: Modifier = Modifier,
    lineColor: Color = MaterialTheme.colorScheme.primary,
    dotColor: Color = MaterialTheme.colorScheme.secondary,
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

        val xSpacing = if (data.size > 1) canvasWidth / (data.size - 1) else canvasWidth
        
        val path = Path()
        val points = mutableListOf<Offset>()

        data.forEachIndexed { index, pair ->
            val label = pair.first
            val value = pair.second

            val x = index * xSpacing
            val y = canvasHeight - 30.dp.toPx() - ((value / maxValue) * (canvasHeight - 30.dp.toPx()))

            val offset = Offset(x, y)
            points.add(offset)

            if (index == 0) {
                path.moveTo(x, y)
            } else {
                path.lineTo(x, y)
            }

            // Draw Label (skip some if too crowded, but for prototype we draw all)
            val textLayoutResult = textMeasurer.measure(label, textStyle)
            val textX = x - (textLayoutResult.size.width / 2)
            val textY = canvasHeight - 20.dp.toPx()

            drawText(
                textLayoutResult = textLayoutResult,
                color = labelColor,
                topLeft = Offset(textX, textY)
            )
        }

        // Draw Line
        drawPath(
            path = path,
            color = lineColor,
            style = Stroke(
                width = 3.dp.toPx(),
                cap = StrokeCap.Round,
                join = StrokeJoin.Round
            )
        )

        // Draw Dots
        points.forEach { point ->
            drawCircle(
                color = dotColor,
                radius = 4.dp.toPx(),
                center = point
            )
        }
    }
}
