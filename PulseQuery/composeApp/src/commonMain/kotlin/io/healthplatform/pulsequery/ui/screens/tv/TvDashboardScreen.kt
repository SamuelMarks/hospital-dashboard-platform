/**
 * TV Form Factor module providing 10-foot viewing distance layouts and D-pad navigation,
 * delegating state and dashboard retrieval to [TvDashboardViewModel].
 */
package io.healthplatform.pulsequery.ui.screens.tv

import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.core.model.VisualizationType
import io.healthplatform.pulsequery.core.result.runCatchingPulse
import io.healthplatform.pulsequery.ui.components.DashboardGridSkeleton
import io.healthplatform.pulsequery.ui.components.WidgetSkeletonPlaceholder
import io.healthplatform.pulsequery.ui.screens.dashboard.extractWidgetSubtitle
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.clinical_status_wallboard
import pulsequery.composeapp.generated.resources.exit_wallboard
import pulsequery.composeapp.generated.resources.live_telemetry_feed
import pulsequery.composeapp.generated.resources.no_telemetry_widgets
import pulsequery.composeapp.generated.resources.press_ok_to_inspect
import pulsequery.composeapp.generated.resources.tv_live_view_subtitle
import pulsequery.composeapp.generated.resources.tv_wallboard
import pulsequery.composeapp.generated.resources.use_dpad_to_select

/**
 * TV Wallboard dashboard screen optimized for passive 10-foot nursing station displays,
 * featuring large high-contrast KPI cards and D-pad directional navigation focus states.
 *
 * @param onExit Optional callback to exit TV mode.
 * @param viewModel Optional [TvDashboardViewModel] instance for state orchestration.
 */
@Composable
fun TvDashboardScreen(
    onExit: () -> Unit = {},
    viewModel: TvDashboardViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, coroutineScope) {
        viewModel ?: TvDashboardViewModel(scope = coroutineScope)
    }

    val uiState by vm.state.collectAsState()

    LaunchedEffect(vm) {
        vm.loadDashboard()
    }

    Surface(
        color = Color(0xFF0A0E14),
        modifier = Modifier.fillMaxSize()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Tv,
                        contentDescription = stringResource(Res.string.tv_wallboard),
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(40.dp)
                    )
                    Column {
                        Text(
                            text = uiState.activeDashboard?.name
                                ?: stringResource(Res.string.clinical_status_wallboard),
                            style = MaterialTheme.typography.headlineLarge.copy(
                                fontSize = 32.sp,
                                fontWeight = FontWeight.Bold
                            ),
                            color = Color.White,
                            modifier = Modifier.semantics { heading() }
                        )
                        Text(
                            text = stringResource(Res.string.tv_live_view_subtitle),
                            style = MaterialTheme.typography.bodyLarge,
                            color = Color(0xFF90A4AE)
                        )
                    }
                }
                SuggestionChip(
                    onClick = onExit,
                    label = { Text(stringResource(Res.string.exit_wallboard), color = Color.White) },
                    colors = SuggestionChipDefaults.suggestionChipColors(containerColor = Color(0xFF1E293B))
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            when {
                uiState.isLoading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = Color(0xFF4CAF50), modifier = Modifier.size(64.dp))
                            DashboardGridSkeleton()
                        }
                    }
                }
                uiState.errorMessage != null -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = uiState.errorMessage.orEmpty(),
                            color = MaterialTheme.colorScheme.error,
                            fontSize = 24.sp
                        )
                    }
                }
                else -> {
                    val widgets = uiState.activeDashboard?.widgets ?: emptyList()
                    if (widgets.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                stringResource(Res.string.no_telemetry_widgets),
                                color = Color.White,
                                fontSize = 24.sp
                            )
                        }
                    } else {
                        TvWidgetCarousel(widgets = widgets)
                    }
                }
            }
        }
    }
}

/**
 * Horizontal carousel row displaying large TV cards with D-pad focus highlight support.
 *
 * @param widgets List of [WidgetResponse] instances to render.
 */
@Composable
fun TvWidgetCarousel(widgets: List<WidgetResponse>) {
    val scrollState = rememberScrollState()

    Row(
        modifier = Modifier
            .fillMaxSize()
            .horizontalScroll(scrollState),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        widgets.forEachIndexed { index, widget ->
            TvCardItem(widget = widget, isFirst = index == 0)
        }
    }
}

/**
 * High-contrast card designed for 10-foot readability with D-pad focus visual cues.
 *
 * @param widget The widget payload to display.
 * @param isFirst Whether this item should request initial focus.
 */
@Composable
fun TvCardItem(widget: WidgetResponse, isFirst: Boolean = false) {
    var isFocused by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        if (isFirst) {
            runCatchingPulse {
                focusRequester.requestFocus()
            }
        }
    }

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isFocused) Color(0xFF1E293B) else Color(0xFF131B26)
        ),
        modifier = Modifier
            .width(420.dp)
            .height(340.dp)
            .focusRequester(focusRequester)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .border(
                width = if (isFocused) 3.dp else 1.dp,
                color = if (isFocused) Color(0xFF4CAF50) else Color(0xFF334155),
                shape = RoundedCornerShape(16.dp)
            )
            .semantics {
                contentDescription = "TV Card: ${widget.title}"
            }
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = widget.title,
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold
                    ),
                    color = Color.White,
                    maxLines = 1
                )
                extractWidgetSubtitle(widget)?.let { sub ->
                    Text(
                        text = sub,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF94A3B8),
                        maxLines = 2,
                        modifier = Modifier.testTag("widget_subtitle_${widget.id}")
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                SuggestionChip(
                    onClick = {},
                    label = { Text(widget.visualization.uppercase(), fontSize = 12.sp, color = Color(0xFF81C784)) },
                    colors = SuggestionChipDefaults.suggestionChipColors(containerColor = Color(0xFF1E3A2F))
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                WidgetSkeletonPlaceholder(
                    visualization = VisualizationType.fromWire(widget.visualization)
                )
                Text(
                    text = stringResource(Res.string.live_telemetry_feed),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color(0xFF64748B)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (isFocused) {
                        stringResource(Res.string.press_ok_to_inspect)
                    } else {
                        stringResource(Res.string.use_dpad_to_select)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isFocused) Color(0xFF4CAF50) else Color(0xFF475569)
                )
            }
        }
    }
}
