/**
 * Enumerated HTTP request methods supported by [ApiClient].
 */
package io.healthplatform.pulsequery.api.infrastructure

/**
 * Provides enumerated HTTP verbs for REST API requests.
 */
enum class RequestMethod {
    /** HTTP GET method for retrieving resources. */
    GET,

    /** HTTP DELETE method for removing resources. */
    DELETE,

    /** HTTP HEAD method for retrieving resource headers without a body. */
    HEAD,

    /** HTTP OPTIONS method for querying supported communication options. */
    OPTIONS,

    /** HTTP PATCH method for applying partial modifications to a resource. */
    PATCH,

    /** HTTP POST method for creating resources or triggering operations. */
    POST,

    /** HTTP PUT method for replacing or updating a resource. */
    PUT
}
