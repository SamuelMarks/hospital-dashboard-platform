/**
 * Text and Markdown note visualization component module for dashboard annotations.
 */
package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/**
 * Normalizes raw markdown/text widget content by trimming leading/trailing whitespace
 * and normalizing CRLF line endings.
 *
 * @param content Raw text or markdown string.
 * @return Normalized display string.
 */
internal fun normalizeMarkdownContent(content: String): String {
    if (content.isBlank()) return ""
    return content.replace("\r\n", "\n").trim()
}

/**
 * Renders textual and markdown widget content for operational notes and clinical guidelines.
 *
 * @param content Raw text or markdown string.
 * @param modifier Compose layout modifier.
 */
@Composable
fun TextMarkdownWidget(
    content: String,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()
    val normalized = normalizeMarkdownContent(content)

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp)
            .semantics { contentDescription = normalized }
            .verticalScroll(scrollState)
    ) {
        Text(
            text = normalized,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
