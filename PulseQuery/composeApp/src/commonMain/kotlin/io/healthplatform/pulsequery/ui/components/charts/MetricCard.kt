/**
 * KPI Metric Card visualization component module for single and multi-value indicators.
 */
package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Formats a metric numeric value, omitting trailing `.0` decimals for whole numbers.
 *
 * @param value Raw floating-point metric value.
 * @return Formatted metric string for display.
 */
internal fun formatMetricValue(value: Float): String {
    return if (value % 1.0f == 0.0f) {
        value.toInt().toString()
    } else {
        value.toString()
    }
}

/**
 * Constructs the accessibility content description for a primary KPI metric card.
 *
 * @param label Metric title label.
 * @param formattedValue Formatted numeric value string.
 * @return Accessibility announcement string.
 */
internal fun buildMetricAccessibilityDescription(label: String, formattedValue: String): String {
    return "Metric $label: $formattedValue"
}

/**
 * A prominent single or multi-value KPI metric card.
 *
 * @param data List of Pair<Label, Value> representing metrics to display.
 * @param modifier Compose modifier for layout.
 */
@Composable
fun MetricCard(
    data: List<Pair<String, Float>>,
    modifier: Modifier = Modifier
) {
    if (data.isEmpty()) return

    val primary = data.first()
    val valueFormatted = formatMetricValue(primary.second)
    val metricDescription = buildMetricAccessibilityDescription(primary.first, valueFormatted)

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = metricDescription },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = valueFormatted,
            style = MaterialTheme.typography.displayMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = primary.first,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (data.size > 1) {
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                data.drop(1).take(2).forEach { (secondaryLabel, secondaryVal) ->
                    val secFormatted = formatMetricValue(secondaryVal)
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = secFormatted,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = secondaryLabel,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
