/**
 * Multi-value query parameter formatting utilities for HTTP API requests.
 */
package io.healthplatform.pulsequery.api.infrastructure

/**
 * Mutable map associating a query parameter name with a list of serialized string values.
 */
typealias MultiValueMap = MutableMap<String, List<String>>

/**
 * Resolves the delimiter string corresponding to an OpenAPI `collectionFormat` identifier.
 *
 * @param collectionFormat Format identifier ("csv", "tsv", "pipe", "space", or other).
 * @return Separator character string for joining collection items.
 */
fun collectionDelimiter(collectionFormat: String): String = when (collectionFormat) {
    "csv" -> ","
    "tsv" -> "	"
    "pipe" -> "|"
    "space" -> " "
    else -> ""
}

/**
 * Default converter function transforming a typed query parameter item into its string representation.
 *
 * @param T Type of the query parameter item.
 * @param item Query parameter value to convert.
 * @return String representation of [item].
 */
fun <T> defaultMultiValueConverter(item: T): String = "$item"

/**
 * Converts an [Array] of items into a list of query parameter strings according to [collectionFormat].
 *
 * @param T Element type of the input array.
 * @param items Array of parameter values.
 * @param collectionFormat OpenAPI collection format ("multi", "csv", "tsv", "pipe", "space").
 * @param map Converter function transforming each element [T] into a [String].
 * @return List of formatted query parameter strings.
 */
fun <T> toMultiValue(
    items: Array<T>,
    collectionFormat: String,
    map: (item: T) -> String = ::defaultMultiValueConverter
): List<String> = toMultiValue(items.asIterable(), collectionFormat, map)

/**
 * Converts an [Iterable] of items into a list of query parameter strings according to [collectionFormat].
 *
 * @param T Element type of the input iterable.
 * @param items Iterable of parameter values.
 * @param collectionFormat OpenAPI collection format ("multi", "csv", "tsv", "pipe", "space").
 * @param map Converter function transforming each element [T] into a [String].
 * @return List of formatted query parameter strings.
 */
fun <T> toMultiValue(
    items: Iterable<T>,
    collectionFormat: String,
    map: (item: T) -> String = ::defaultMultiValueConverter
): List<String> {
    return when (collectionFormat) {
        "multi" -> items.map(map)
        else -> listOf(items.joinToString(separator = collectionDelimiter(collectionFormat), transform = map))
    }
}
