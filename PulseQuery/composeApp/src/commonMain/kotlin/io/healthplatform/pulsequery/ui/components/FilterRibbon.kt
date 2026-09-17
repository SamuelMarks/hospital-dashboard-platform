/**
 * Filter Ribbon component for global dashboard filtering by department and time range.
 */
package io.healthplatform.pulsequery.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Standard clinical departments for dashboard scoping.
 */
val CLINICAL_DEPARTMENTS: List<String> = listOf(
    "All Departments",
    "Cardiology",
    "General Medicine",
    "General Surgery",
    "Neurology",
    "Pediatrics",
    "ICU",
    "Orthopedics"
)

/**
 * Common analytical time ranges for dashboard queries.
 */
val TIME_RANGE_PRESETS: List<String> = listOf(
    "All Time",
    "Last 24 Hours",
    "Last 7 Days",
    "Last 30 Days",
    "Current Fiscal Quarter"
)

/**
 * Global Dashboard Filter Ribbon component allowing clinical analysts to apply
 * department and temporal constraints across all widgets on an active dashboard.
 *
 * @param activeDepartment Currently selected department, or null for all.
 * @param activeTimeRange Currently selected time range filter, or null for all time.
 * @param onFiltersChanged Callback invoked when active filters are updated.
 * @param onResetFilters Callback invoked when resetting all filters to defaults.
 * @param modifier Optional layout modifier.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilterRibbon(
    activeDepartment: String?,
    activeTimeRange: String?,
    onFiltersChanged: (department: String?, timeRange: String?) -> Unit,
    onResetFilters: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showDeptMenu by remember { mutableStateOf(false) }
    var showTimeMenu by remember { mutableStateOf(false) }

    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 6.dp)
        ) {
            Icon(
                imageVector = Icons.Default.FilterList,
                contentDescription = "Filter Ribbon",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp)
            )

            // Department Selector
            Box {
                FilterChip(
                    selected = activeDepartment != null && activeDepartment != "All Departments",
                    onClick = { showDeptMenu = true },
                    label = { Text(activeDepartment ?: "Department: All") }
                )
                DropdownMenu(
                    expanded = showDeptMenu,
                    onDismissRequest = { showDeptMenu = false }
                ) {
                    CLINICAL_DEPARTMENTS.forEach { dept ->
                        DropdownMenuItem(
                            text = { Text(dept) },
                            onClick = {
                                showDeptMenu = false
                                val selected = if (dept == "All Departments") null else dept
                                onFiltersChanged(selected, activeTimeRange)
                            }
                        )
                    }
                }
            }

            // Time Range Selector
            Box {
                FilterChip(
                    selected = activeTimeRange != null && activeTimeRange != "All Time",
                    onClick = { showTimeMenu = true },
                    label = { Text(activeTimeRange ?: "Time: All") }
                )
                DropdownMenu(
                    expanded = showTimeMenu,
                    onDismissRequest = { showTimeMenu = false }
                ) {
                    TIME_RANGE_PRESETS.forEach { preset ->
                        DropdownMenuItem(
                            text = { Text(preset) },
                            onClick = {
                                showTimeMenu = false
                                val selected = if (preset == "All Time") null else preset
                                onFiltersChanged(activeDepartment, selected)
                            }
                        )
                    }
                }
            }

            // Reset Filter Button if active filters present
            val hasActiveFilter = (activeDepartment != null && activeDepartment != "All Departments") ||
                    (activeTimeRange != null && activeTimeRange != "All Time")
            if (hasActiveFilter) {
                IconButton(
                    onClick = onResetFilters,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Clear,
                        contentDescription = "Clear Filters",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}
