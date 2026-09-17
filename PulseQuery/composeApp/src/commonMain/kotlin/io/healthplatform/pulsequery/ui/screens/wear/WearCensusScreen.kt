/**
 * Wearable Form Factor module providing glanceable hospital census and capacity alert tiles.
 */
package io.healthplatform.pulsequery.ui.screens.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Wearable companion screen optimized for round and compact smartwatches,
 * presenting hospital census metrics and high-priority bed capacity alerts.
 *
 * @param onExit Optional callback to exit wearable view mode.
 */
@Composable
fun WearCensusScreen(
    onExit: () -> Unit = {}
) {
    var alerts by remember { mutableStateOf<List<AlertRuleResponse>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    val coroutineScope = rememberCoroutineScope()

    fun loadWearData() {
        coroutineScope.launch {
            isLoading = true
            runCatching {
                val alertRes = AppContainer.alertRulesApi.listAlertRulesApiV1AnalyticsAlertRulesGet()
                alertRes.body()
            }.onSuccess { fetchedAlerts ->
                alerts = fetchedAlerts
            }
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        loadWearData()
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
                        contentDescription = "Wearable Header",
                        tint = Color(0xFF64B5F6),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Pulse Watch",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF90CAF9),
                        modifier = Modifier.semantics { heading() }
                    )
                }
            }

            // Glanceable Census KPI Ring Card
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1A1A1A)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Census: 88% Occupied, 42 Open Beds" }
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("HOSPITAL CENSUS", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.SemiBold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "88%",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFFFFB74D)
                        )
                        Text("42 Beds Open", fontSize = 11.sp, color = Color(0xFF81C784))
                    }
                }
            }

            // Critical Alerts Section
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "ACTIVE ALERTS (${alerts.size})",
                        fontSize = 10.sp,
                        color = Color(0xFFE57373),
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(
                        onClick = { loadWearData() },
                        modifier = Modifier.size(20.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh Wear Data",
                            tint = Color.Gray,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }

            if (isLoading) {
                item {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                        color = Color(0xFF64B5F6)
                    )
                }
            } else if (alerts.isEmpty()) {
                item {
                    Text(
                        text = "All units nominal",
                        fontSize = 11.sp,
                        color = Color(0xFF81C784),
                        textAlign = TextAlign.Center
                    )
                }
            } else {
                items(alerts) { alert ->
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
                    Text("Exit", fontSize = 11.sp)
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
                    text = "Threshold: >${alert.thresholdPercentage.toInt()}%",
                    fontSize = 9.sp,
                    color = Color(0xFFEF9A9A)
                )
            }
        }
    }
}
