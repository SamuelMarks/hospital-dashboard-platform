/**
 * Shimmer skeleton placeholder composables for asynchronous widget and dashboard loading states.
 */
package io.healthplatform.pulsequery.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.core.model.VisualizationType
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.loading_dashboard_layout
import pulsequery.composeapp.generated.resources.loading_templates
import pulsequery.composeapp.generated.resources.loading_widget_data

/**
 * Renders a visualization-aware shimmer skeleton placeholder inside a widget card while its query is loading.
 *
 * @param visualization Target [VisualizationType] determining the placeholder silhouette shape.
 * @param modifier Optional [Modifier] applied to the root container.
 */
@Composable
fun WidgetSkeletonPlaceholder(
    visualization: VisualizationType = VisualizationType.TABLE,
    modifier: Modifier = Modifier
) {
    val transition = rememberInfiniteTransition(label = "widget_shimmer")
    val alpha by transition.animateFloat(
        initialValue = 0.25f,
        targetValue = 0.65f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "shimmer_alpha"
    )
    val placeholderColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = alpha)
    val loadingDesc = stringResource(Res.string.loading_widget_data)

    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp)
            .testTag("widget_skeleton_${visualization.wireValue}")
            .semantics {
                contentDescription = loadingDesc
                liveRegion = LiveRegionMode.Polite
            }
    ) {
        when (visualization) {
            VisualizationType.METRIC -> {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.55f)
                            .height(44.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(placeholderColor)
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.35f)
                            .height(16.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(placeholderColor)
                    )
                }
            }
            VisualizationType.PIE_CHART -> {
                Row(
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(110.dp)
                            .clip(CircleShape)
                            .background(placeholderColor)
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        repeat(3) {
                            Box(
                                modifier = Modifier
                                    .size(width = 80.dp, height = 14.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(placeholderColor)
                            )
                        }
                    }
                }
            }
            VisualizationType.BAR_CHART, VisualizationType.LINE_CHART -> {
                Row(
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    val heights = listOf(0.45f, 0.8f, 0.6f, 0.95f, 0.7f)
                    heights.forEach { frac ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(frac)
                                .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                .background(placeholderColor)
                        )
                    }
                }
            }
            else -> {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(28.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(placeholderColor)
                    )
                    repeat(4) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .weight(2f)
                                    .height(20.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(placeholderColor)
                            )
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .height(20.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(placeholderColor)
                            )
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .height(20.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(placeholderColor)
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Renders a multi-card dashboard grid skeleton while the dashboard definition is loading.
 *
 * @param modifier Optional [Modifier] applied to the skeleton container.
 */
@Composable
fun DashboardGridSkeleton(modifier: Modifier = Modifier) {
    val loadingDesc = stringResource(Res.string.loading_dashboard_layout)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
            .testTag("dashboard_grid_skeleton")
            .semantics {
                contentDescription = loadingDesc
                liveRegion = LiveRegionMode.Polite
            },
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        val vizTypes = listOf(VisualizationType.METRIC, VisualizationType.BAR_CHART, VisualizationType.TABLE)
        vizTypes.forEach { viz ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                WidgetSkeletonPlaceholder(visualization = viz)
            }
        }
    }
}

/**
 * Renders a list of template card skeletons while the Template Marketplace is loading.
 *
 * @param modifier Optional [Modifier] applied to the list container.
 */
@Composable
fun TemplateListSkeleton(modifier: Modifier = Modifier) {
    val loadingDesc = stringResource(Res.string.loading_templates)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
            .testTag("template_list_skeleton")
            .semantics {
                contentDescription = loadingDesc
                liveRegion = LiveRegionMode.Polite
            },
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        repeat(4) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(88.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                WidgetSkeletonPlaceholder(visualization = VisualizationType.TABLE)
            }
        }
    }
}
