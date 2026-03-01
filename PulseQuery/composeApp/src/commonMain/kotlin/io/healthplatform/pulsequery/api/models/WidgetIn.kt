package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.Serializable

@Serializable
sealed class WidgetIn {
    abstract val title: String
    abstract val type: String
    abstract val visualization: String
}
