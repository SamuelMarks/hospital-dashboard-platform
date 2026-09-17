/**
 * TV Form Factor module providing 10-foot viewing distance layouts and D-pad navigation.
 */
package io.healthplatform.pulsequery.ui.screens.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * TV Wallboard dashboard screen optimized for passive 10-foot nursing station displays,
 * featuring large high-contrast KPI cards and D-pad directional navigation focus states.
 *
 * @param onExit Optional callback to exit TV mode.
 */
@Composable
fun TvDashboardScreen(
    onExit: () -> Unit = {}
) {
    var activeDashboard by remember { mutableStateOf<DashboardResponse?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        coroutineScope.launch {
            runCatching {
                val res = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
                res.body().firstOrNull()
            }.fold(
                onSuccess = { db ->
                    activeDashboard = db
                },
                onFailure = { e ->
                    errorMessage = e.message ?: "Failed to load TV dashboard"
                }
            )
            isLoading = false
        }
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
            // Header Bar
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Icon(
                        imageVector = Icons.Default.Tv,
                        contentDescription = "TV Wallboard",
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(40.dp)
                    )
                    Column {
                        Text(
                            text = activeDashboard?.name ?: "Clinical Status Wallboard",
                            style = MaterialTheme.typography.headlineLarge.copy(fontSize = 32.sp, fontWeight = FontWeight.Bold),
                            color = Color.White,
                            modifier = Modifier.semantics { heading() }
                        )
                        Text(
                            text = "Hospital Operations Telemetry • Live View",
                            style = MaterialTheme.typography.bodyLarge,
                            color = Color(0xFF90A4AE)
                        )
                    }
                }
                SuggestionChip(
                    onClick = onExit,
                    label = { Text("Exit Wallboard", color = Color.White) },
                    colors = SuggestionChipDefaults.suggestionChipColors(containerColor = Color(0xFF1E293B))
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            when {
                isLoading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color(0xFF4CAF50), modifier = Modifier.size(64.dp))
                    }
                }
                errorMessage != null -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error, fontSize = 24.sp)
                    }
                }
                else -> {
                    val widgets = activeDashboard?.widgets ?: emptyList()
                    if (widgets.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No telemetry widgets active on this board.", color = Color.White, fontSize = 24.sp)
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
            runCatching {
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
                    style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold),
                    color = Color.White,
                    maxLines = 1
                )
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
                Text(
                    text = "Live Telemetry Feed",
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
                    text = if (isFocused) "Press OK to inspect" else "Use D-pad to select",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isFocused) Color(0xFF4CAF50) else Color(0xFF475569)
                )
            }
        }
    }
}
