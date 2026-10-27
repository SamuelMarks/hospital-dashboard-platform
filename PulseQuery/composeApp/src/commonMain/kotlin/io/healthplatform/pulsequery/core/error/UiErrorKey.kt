/**
 * Typed UI Error Representation and Localization Key Mapping Module.
 *
 * Maps [PulseQueryError] instances and ViewModel operation failures into strongly typed
 * [UiErrorKey] identifiers backed by Compose resource keys (`strings.xml`).
 */
package io.healthplatform.pulsequery.core.error

/**
 * Strongly typed enumeration of localized UI error keys corresponding to `composeResources/values/strings.xml`.
 *
 * @property resourceKey Resource identifier in `strings.xml`.
 * @property fallbackMessage Default localized text used when resolving error messages outside a Compose context.
 */
enum class UiErrorKey(
    val resourceKey: String,
    val fallbackMessage: String
) {
    /** Generic unknown error fallback. */
    UNKNOWN_ERROR("unknown_error", "Unknown error"),

    /** Network host unreachable failure. */
    NETWORK_UNREACHABLE("backend_inaccessible", "Backend unreachable"),

    /** Network socket or HTTP request timeout. */
    NETWORK_TIMEOUT("error_timeout", "Network request timed out"),

    /** Authentication required or invalid credentials. */
    AUTH_UNAUTHORIZED("authentication_failed", "Authentication failed"),

    /** Registration failure. */
    REGISTRATION_FAILED("registration_failed", "Registration failed"),

    /** Failed to load widget data. */
    LOAD_WIDGET_DATA("failed_to_load_data", "Failed to load data"),

    /** Failed to execute interactive natural-text widget query. */
    EXECUTE_NATURAL_TEXT("failed_to_load_data", "Failed to execute natural text query"),

    /** Failed to load templates in widget builder wizard. */
    LOAD_TEMPLATES("error_load_templates", "Failed to load templates"),

    /** Failed to create widget in widget builder wizard. */
    CREATE_WIDGET("error_create_widget", "Failed to create widget"),

    /** Failed to record candidate vote in chat or MPAX arena. */
    RECORD_VOTE("error_record_vote", "Failed to record vote"),

    /** Failed to record MPAX candidate vote. */
    RECORD_CANDIDATE_VOTE("error_record_candidate_vote", "Failed to record candidate vote"),

    /** Failed to execute MPAX Arena evaluation. */
    EXECUTE_MPAX_ARENA("error_mpax_arena", "Failed to execute MPAX Arena evaluation"),

    /** Failed to load SQL and MPAX benchmarks. */
    LOAD_BENCHMARKS("error_load_benchmarks", "Failed to load benchmarks"),

    /** Failed to run capacity simulation. */
    SIMULATION_FAILED("simulation_failed", "Simulation failed"),

    /** Failed to load capacity alert rules. */
    LOAD_ALERT_RULES("error_load_alert_rules", "Failed to load alert rules"),

    /** Failed to delete capacity alert rule. */
    DELETE_ALERT_RULE("error_delete_alert_rule", "Failed to delete rule"),

    /** Failed to create capacity alert rule. */
    CREATE_ALERT_RULE("error_create_alert_rule", "Creation failed"),

    /** Failed to update capacity alert rule. */
    UPDATE_ALERT_RULE("error_update_alert_rule", "Update failed"),

    /** Failed to load administrative users list. */
    LOAD_USERS("error_load_users", "Failed to load users"),

    /** Failed to update user role. */
    UPDATE_USER_ROLE("error_update_role", "Failed to update role"),

    /** Failed to toggle user active status. */
    TOGGLE_USER_STATUS("error_toggle_user_status", "Failed to toggle user status"),

    /** Failed to load TV wallboard dashboard. */
    LOAD_TV_DASHBOARD("error_load_tv_dashboard", "Failed to load TV dashboard"),

    /** Failed to load wearable census alerts. */
    LOAD_WEAR_ALERTS("error_load_wear_alerts", "Failed to load wearable census alerts");

    /**
     * Companion utilities for mapping [PulseQueryError] subtypes to [UiErrorKey].
     */
    companion object {
        /**
         * Maps a [PulseQueryError] into its canonical [UiErrorKey], falling back to [defaultKey].
         *
         * @param error Domain [PulseQueryError] to classify.
         * @param defaultKey Fallback [UiErrorKey] when no more specific mapping applies.
         * @return Resolved [UiErrorKey].
         */
        fun fromPulseQueryError(
            error: PulseQueryError,
            defaultKey: UiErrorKey = UNKNOWN_ERROR
        ): UiErrorKey =
            when (error) {
                is PulseQueryError.Network.Unreachable -> NETWORK_UNREACHABLE
                is PulseQueryError.Network.Timeout -> NETWORK_TIMEOUT
                is PulseQueryError.Http.Unauthorized,
                is PulseQueryError.Auth -> AUTH_UNAUTHORIZED
                else -> defaultKey
            }
    }
}
