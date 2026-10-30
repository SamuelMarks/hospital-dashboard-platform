/**
 * Wearable Form Factor module providing glanceable hospital census and capacity alert tiles,
 * delegating state and alert rule fetching to [WearCensusViewModel].
 */
package io.healthplatform.pulsequery.ui.screens.wear

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.all_units_nominal
import pulsequery.composeapp.generated.resources.exit_button
import pulsequery.composeapp.generated.resources.hospital_census_upper
import pulsequery.composeapp.generated.resources.pulse_watch
import pulsequery.composeapp.generated.resources.refresh_wear_data
import pulsequery.composeapp.generated.resources.wear_active_alerts
import pulsequery.composeapp.generated.resources.wear_alert_threshold_label
import pulsequery.composeapp.generated.resources.wear_census_summary_desc
import pulsequery.composeapp.generated.resources.wear_occupancy_percent
import pulsequery.composeapp.generated.resources.wear_open_beds
import pulsequery.composeapp.generated.resources.wearable_header

/**
 * Wearable companion screen optimized for round and compact smartwatches,
 * presenting hospital census metrics and high-priority bed capacity alerts.
 *
 * @param onExit Optional callback to exit wearable view mode.
 * @param viewModel Optional [WearCensusViewModel] instance for state orchestration.
 */
@Composable
fun WearCensusScreen(
    onExit: () -> Unit = {},
    viewModel: WearCensusViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, coroutineScope) {
        viewModel ?: WearCensusViewModel(scope = coroutineScope)
    }

    val uiState by vm.state.collectAsState()
    val censusDesc = stringResource(
        Res.string.wear_census_summary_desc,
        uiState.occupancyPercent,
        uiState.openBeds
    )

    LaunchedEffect(vm) {
        vm.loadWearData()
    }

    Surface(
        color = Color.Black,
        modifier = Modifier.fillMaxSize()
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Watch,
                        contentDescription = stringResource(Res.string.wearable_header),
                        tint = Color(0xFF64B5F6),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = stringResource(Res.string.pulse_watch),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF90CAF9),
                        modifier = Modifier.semantics { heading() }
                    )
                }
            }

            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1A1A1A)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = censusDesc }
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            stringResource(Res.string.hospital_census_upper),
                            fontSize = 10.sp,
                            color = Color.Gray,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = stringResource(Res.string.wear_occupancy_percent, uiState.occupancyPercent),
                            fontSize = 28.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFFFFB74D)
                        )
                        Text(
                            stringResource(Res.string.wear_open_beds, uiState.openBeds),
                            fontSize = 11.sp,
                            color = Color(0xFF81C784)
                        )
                    }
                }
            }

            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = stringResource(Res.string.wear_active_alerts, uiState.alerts.size),
                        fontSize = 10.sp,
                        color = Color(0xFFE57373),
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(
                        onClick = { vm.loadWearData() },
                        modifier = Modifier.size(20.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(Res.string.refresh_wear_data),
                            tint = Color.Gray,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }

            if (uiState.isLoading) {
                item {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                        color = Color(0xFF64B5F6)
                    )
                }
            } else if (uiState.alerts.isEmpty()) {
                item {
                    Text(
                        text = stringResource(Res.string.all_units_nominal),
                        fontSize = 11.sp,
                        color = Color(0xFF81C784),
                        textAlign = TextAlign.Center
                    )
                }
            } else {
                items(uiState.alerts) { alert ->
                    WearAlertCard(alert = alert)
                }
            }

            item {
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onExit,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF263238)),
                    modifier = Modifier.height(32.dp)
                ) {
                    Text(stringResource(Res.string.exit_button), fontSize = 11.sp)
                }
            }
        }
    }
}

/**
 * Compact alert card for smart watch displays.
 *
 * @param alert The [AlertRuleResponse] alerting configuration to display.
 */
@Composable
fun WearAlertCard(alert: AlertRuleResponse) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF241414)),
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Alert: ${alert.unitCategory}" }
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(Color(0xFFE53935), CircleShape)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = alert.unitCategory,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1
                )
                Text(
                    text = stringResource(Res.string.wear_alert_threshold_label, alert.thresholdPercentage.toInt()),
                    fontSize = 9.sp,
                    color = Color(0xFFEF9A9A)
                )
            }
        }
    }
}
