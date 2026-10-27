/**
 * Polymorphic widget creation payload models (`SQL`, `HTTP`, `TEXT`).
 */
package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Content-based polymorphic serializer for [WidgetIn] dispatching on the `"type"` JSON property.
 */
object WidgetInSerializer : JsonContentPolymorphicSerializer<WidgetIn>(WidgetIn::class) {
    /**
     * Selects the concrete [DeserializationStrategy] based on the `"type"` field in [element].
     *
     * @param element Parsed JSON payload.
     * @return Concrete [WidgetIn] subtype serializer.
     */
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<WidgetIn> {
        val typeElement = element.jsonObject["type"] ?: return WidgetIn.Sql.serializer()
        return when (typeElement.jsonPrimitive.content.uppercase()) {
            "TEXT" -> WidgetIn.Text.serializer()
            "HTTP" -> WidgetIn.Http.serializer()
            else -> WidgetIn.Sql.serializer()
        }
    }
}

/**
 * Polymorphic base model for creating dashboard widgets.
 */
@Serializable(with = WidgetInSerializer::class)
sealed class WidgetIn {
    /** Display title of the widget. */
    abstract val title: String

    /** Discriminator type of the widget ("SQL", "TEXT", or "HTTP"). */
    abstract val type: String

    /** Visualization identifier ("table", "bar_chart", "line_chart", "pie_chart", "heatmap", "metric", "markdown"). */
    abstract val visualization: String

    /**
     * SQL widget creation payload.
     *
     * @property title Display title of the SQL widget.
     * @property type Widget source discriminator ("SQL").
     * @property visualization Selected chart or table visualization identifier.
     * @property config SQL query configuration payload.
     */
    @Serializable
    @SerialName("SQL")
    data class Sql(
        override val title: String,
        override val type: String = "SQL",
        override val visualization: String,
        val config: SqlConfig
    ) : WidgetIn()

    /**
     * Text / Markdown widget creation payload.
     *
     * @property title Display title of the text widget.
     * @property type Widget source discriminator ("TEXT").
     * @property visualization Selected visualization identifier ("markdown").
     * @property config Text content configuration payload.
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
     * External HTTP endpoint widget creation payload.
     *
     * @property title Display title of the HTTP widget.
     * @property type Widget source discriminator ("HTTP").
     * @property visualization Selected visualization identifier ("table").
     * @property config HTTP request configuration payload.
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
