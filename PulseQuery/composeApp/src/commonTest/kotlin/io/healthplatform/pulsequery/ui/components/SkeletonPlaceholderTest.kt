/**
 * Compose UI and accessibility semantics tests for skeleton loading placeholders.
 */
package io.healthplatform.pulsequery.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.core.model.VisualizationType
import io.healthplatform.pulsequery.testing.BaseComposeTest
import kotlin.test.Test

/**
 * UI and semantics tests for [WidgetSkeletonPlaceholder], [DashboardGridSkeleton], and [TemplateListSkeleton].
 */
class SkeletonPlaceholderTest : BaseComposeTest() {

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAllSkeletonPlaceholdersRenderWithSemantics() = runComposeUiTest {
        setContent {
            MaterialTheme {
                WidgetSkeletonPlaceholder(visualization = VisualizationType.METRIC)
                WidgetSkeletonPlaceholder(visualization = VisualizationType.PIE_CHART)
                WidgetSkeletonPlaceholder(visualization = VisualizationType.BAR_CHART)
                WidgetSkeletonPlaceholder(visualization = VisualizationType.LINE_CHART)
                WidgetSkeletonPlaceholder(visualization = VisualizationType.TABLE)
                DashboardGridSkeleton()
                TemplateListSkeleton()
            }
        }

        onNodeWithTag("widget_skeleton_pie_chart").assertExists()
        onNodeWithTag("dashboard_grid_skeleton").assertExists()
        onNodeWithTag("template_list_skeleton").assertExists()
    }
}
