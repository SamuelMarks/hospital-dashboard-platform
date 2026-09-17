package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Polymorphic base model for creating widgets.
 */
@Serializable
sealed class WidgetIn {
    /** The title of the widget. */
    abstract val title: String
    /** The widget type identifier (e.g., SQL, TEXT, HTTP). */
    abstract val type: String
    /** The visualization format (e.g., table, bar_chart). */
    abstract val visualization: String

    /**
     * Payload for creating a SQL widget.
     */
    @Serializable
    @SerialName("SQL")
    data class Sql(
        override val title: String,
        override val type: String = "SQL",
        override val visualization: String = "table",
        val config: SqlConfig
    ) : WidgetIn()

    /**
     * Payload for creating a text widget.
     */
    @Serializable
    @SerialName("TEXT")
    data class Text(
        override val title: String,
        override val type: String = "TEXT",
        override val visualization: String = "markdown",
        val config: TextConfig
    ) : WidgetIn()

    /**
     * Payload for creating an HTTP widget.
     */
    @Serializable
    @SerialName("HTTP")
    data class Http(
        override val title: String,
        override val type: String = "HTTP",
        override val visualization: String = "table",
        val config: HttpConfig
    ) : WidgetIn()
}
