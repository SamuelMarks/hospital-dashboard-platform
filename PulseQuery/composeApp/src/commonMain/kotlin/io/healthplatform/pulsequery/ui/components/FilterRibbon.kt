/**
 * Filter Ribbon component for global dashboard filtering by department and time range.
 */
package io.healthplatform.pulsequery.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.clear_filters
import pulsequery.composeapp.generated.resources.department_all
import pulsequery.composeapp.generated.resources.filter_ribbon
import pulsequery.composeapp.generated.resources.time_all

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
 * Checks whether a non-default clinical department filter is active.
 *
 * @param activeDepartment Selected department string, or null.
 * @return True if a specific department is selected.
 */
internal fun isDepartmentFilterActive(activeDepartment: String?): Boolean {
    return activeDepartment != null && activeDepartment != "All Departments"
}

/**
 * Checks whether a non-default time range filter is active.
 *
 * @param activeTimeRange Selected time range string, or null.
 * @return True if a specific time range is selected.
 */
internal fun isTimeRangeFilterActive(activeTimeRange: String?): Boolean {
    return activeTimeRange != null && activeTimeRange != "All Time"
}

/**
 * Checks whether either a department filter or time range filter is currently active.
 *
 * @param activeDepartment Selected department string, or null.
 * @param activeTimeRange Selected time range string, or null.
 * @return True if at least one filter is active.
 */
internal fun hasAnyActiveFilter(activeDepartment: String?, activeTimeRange: String?): Boolean {
    return isDepartmentFilterActive(activeDepartment) || isTimeRangeFilterActive(activeTimeRange)
}

/**
 * Normalizes a selected department menu item, mapping `"All Departments"` to `null`.
 *
 * @param department Selected department label.
 * @return Normalized department filter value, or null for all departments.
 */
internal fun normalizeDepartmentSelection(department: String): String? {
    return if (department == "All Departments") null else department
}

/**
 * Normalizes a selected time range preset item, mapping `"All Time"` to `null`.
 *
 * @param preset Selected time range label.
 * @return Normalized time range filter value, or null for all time.
 */
internal fun normalizeTimeRangeSelection(preset: String): String? {
    return if (preset == "All Time") null else preset
}

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
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
        modifier = modifier.fillMaxWidth()
    ) {
        FilterRibbonContent(
            activeDepartment = activeDepartment,
            activeTimeRange = activeTimeRange,
            onFiltersChanged = onFiltersChanged,
            onResetFilters = onResetFilters
        )
    }
}

/**
 * Renders the interactive filter chips, dropdown menus, and reset button inside [FilterRibbon].
 *
 * @param activeDepartment Currently selected department, or null for all.
 * @param activeTimeRange Currently selected time range filter, or null for all time.
 * @param onFiltersChanged Callback invoked when active filters are updated.
 * @param onResetFilters Callback invoked when resetting all filters to defaults.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterRibbonContent(
    activeDepartment: String?,
    activeTimeRange: String?,
    onFiltersChanged: (department: String?, timeRange: String?) -> Unit,
    onResetFilters: () -> Unit
) {
    var showDeptMenu by remember { mutableStateOf(false) }
    var showTimeMenu by remember { mutableStateOf(false) }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 6.dp)
    ) {
        Icon(
            imageVector = Icons.Default.FilterList,
            contentDescription = stringResource(Res.string.filter_ribbon),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp)
        )

        // Department Selector
        Box {
            FilterChip(
                selected = isDepartmentFilterActive(activeDepartment),
                onClick = { showDeptMenu = true },
                label = { Text(activeDepartment ?: stringResource(Res.string.department_all)) }
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
                            onFiltersChanged(normalizeDepartmentSelection(dept), activeTimeRange)
                        }
                    )
                }
            }
        }

        // Time Range Selector
        Box {
            FilterChip(
                selected = isTimeRangeFilterActive(activeTimeRange),
                onClick = { showTimeMenu = true },
                label = { Text(activeTimeRange ?: stringResource(Res.string.time_all)) }
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
                            onFiltersChanged(activeDepartment, normalizeTimeRangeSelection(preset))
                        }
                    )
                }
            }
        }

        // Reset Filter Button if active filters present
        if (hasAnyActiveFilter(activeDepartment, activeTimeRange)) {
            IconButton(
                onClick = onResetFilters,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Clear,
                    contentDescription = stringResource(Res.string.clear_filters),
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}
