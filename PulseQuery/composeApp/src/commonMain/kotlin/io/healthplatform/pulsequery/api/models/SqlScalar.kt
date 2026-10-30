/**
 * Typealias mapping OpenAPI `SqlScalar` union values to [kotlinx.serialization.json.JsonElement].
 */
package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.json.JsonElement

/**
 * Strongly typed JSON scalar representation (`String`, `Number`, `Boolean`, or `JsonNull`) for SQL/Quick-Action table cells.
 */
typealias SqlScalar = JsonElement
