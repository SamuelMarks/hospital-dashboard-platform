package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlin.math.min

/**
 * A natively drawn Material 3 Pie / Donut Chart component.
 *
 * @param data List of Pair<Label, Value> representing pie slices.
 * @param modifier Compose modifier for layout.
 * @param sliceColors Optional custom color palette for slices.
 */
@Composable
fun PieChart(
    data: List<Pair<String, Float>>,
    modifier: Modifier = Modifier,
    sliceColors: List<Color> = listOf(
        Color(0xFF2563EB), // Blue
        Color(0xFF10B981), // Green
        Color(0xFFF59E0B), // Amber
        Color(0xFFEF4444), // Red
        Color(0xFF8B5CF6), // Purple
        Color(0xFFEC4899), // Pink
        Color(0xFF06B6D4)  // Cyan
    )
) {
    if (data.isEmpty()) return

    val total = data.sumOf { it.second.toDouble() }.toFloat()
    val chartDescription = "Pie chart with ${data.size} slices: " +
        data.joinToString(separator = ", ") { "${it.first}: ${it.second}" }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = chartDescription },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Canvas(
            modifier = Modifier
                .size(160.dp)
                .padding(8.dp)
        ) {
            val canvasSize = min(size.width, size.height)
            val strokeWidth = canvasSize * 0.25f
            val diameter = canvasSize - strokeWidth
            val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
            val arcSize = Size(diameter, diameter)

            var startAngle = -90f
            data.forEachIndexed { index, (_, value) ->
                val sweepAngle = if (total > 0f) (value / total) * 360f else 0f
                val color = sliceColors[index % sliceColors.size]

                drawArc(
                    color = color,
                    startAngle = startAngle,
                    sweepAngle = sweepAngle,
                    useCenter = true,
                    topLeft = topLeft,
                    size = arcSize
                )
                startAngle += sweepAngle
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Legend
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center
        ) {
            data.take(4).forEachIndexed { index, (label, _) ->
                val color = sliceColors[index % sliceColors.size]
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 6.dp)
                ) {
                    Canvas(modifier = Modifier.size(8.dp)) {
                        drawCircle(color = color)
                    }
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
