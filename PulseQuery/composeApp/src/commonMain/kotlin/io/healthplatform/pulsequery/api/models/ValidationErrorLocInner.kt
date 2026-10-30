/**
 * Location segment model for FastAPI HTTP 422 validation errors.
 */
@file:Suppress(
    "REDUNDANT_CALL_OF_CONVERSION_METHOD",
    "UNNECESSARY_SAFE_CALL",
    "ArrayInDataClass",
    "EnumEntryName",
    "RemoveRedundantQualifierName",
    "UnusedImport",
    "EnumNaming"
)

package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.Serializable

/**
 * Represents a path segment within a [ValidationError.loc] location array.
 */
@Serializable
class ValidationErrorLocInner
