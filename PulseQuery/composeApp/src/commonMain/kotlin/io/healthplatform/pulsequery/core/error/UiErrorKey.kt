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

    /** Failed to record candidate vote in chat. */
    RECORD_VOTE("error_record_vote", "Failed to record vote"),

    /** Failed to execute JAX/MPAX hospital optimization solve or iteration. */
    OPTIMIZATION_FAILED("optimization_failed", "Optimization failed"),

    /** Failed to execute census or optimization Quick Action. */
    QUICK_ACTION_FAILED("quick_action_failed", "Quick Action execution failed"),

    /** Failed to submit qualitative UX evaluation survey. */
    SURVEY_SUBMISSION_FAILED("survey_submission_failed", "Failed to submit evaluation survey"),

    /** Failed to hot-load on-device LiteRT model artifact. */
    LITERT_HOT_LOAD_FAILED("litert_hot_load_failed", "Failed to hot-load LiteRT model"),

    /** Failed to load SQL and optimization benchmarks. */
    LOAD_BENCHMARKS("error_load_benchmarks", "Failed to load benchmarks"),

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
    LOAD_WEAR_ALERTS("error_load_wear_alerts", "Failed to load wearable census alerts"),

    /** Failed to export dashboard as CSV. */
    EXPORT_CSV_FAILED("export_csv_failed", "Failed to export CSV"),

    /** Failed to export dashboard as PDF. */
    EXPORT_PDF_FAILED("export_pdf_failed", "Failed to export PDF"),

    /** Failed to export dashboard as JSON. */
    EXPORT_JSON_FAILED("export_json_failed", "Failed to export JSON"),

    /** Confirmation message when a widget is added to a dashboard. */
    WIDGET_SAVED_SUCCESS("widget_saved_to_dashboard_success", "Widget successfully added to dashboard"),

    /** Confirmation message when a template is registered in the library. */
    TEMPLATE_REGISTERED_SUCCESS("template_registered_success", "Template successfully registered in library"),

    /** Network error during SSE chat token streaming. */
    CHAT_STREAM_NETWORK_ERROR("chat_stream_network_error", "Network error during token streaming"),

    /** Non-2xx HTTP status returned by SSE chat stream endpoint. */
    CHAT_STREAM_HTTP_ERROR("chat_stream_http_error", "Server returned"),

    /** Generic SSE chat streaming failure or malformed packet. */
    CHAT_STREAM_FAILED("chat_stream_failed", "Streaming failed"),

    /** Fallback when deploying staged queries from the query cart fails. */
    CART_DEPLOY_FAILED("cart_deploy_failed", "Failed to deploy queries to dashboard"),

    /** Fallback when saving an analytical query or template fails. */
    SAVE_QUERY_FAILED("save_query_failed", "Failed to save query"),

    /** Fallback when updating an existing widget fails. */
    UPDATE_WIDGET_FAILED("edit_widget_update_failed", "Failed to update widget"),

    /** Fallback when loading dashboard collaborators fails. */
    LOAD_COLLABORATORS("failed_to_load_data", "Failed to load collaborators"),

    /** Fallback when inviting a dashboard collaborator fails. */
    INVITE_COLLABORATOR("failed_to_load_data", "Failed to invite user"),

    /** Fallback when revoking a dashboard share fails. */
    REVOKE_COLLABORATOR("failed_to_load_data", "Failed to revoke share"),

    /** All registration fields are required. */
    AUTH_ALL_FIELDS_REQUIRED("auth_all_fields_required", "All fields are required."),

    /** Password and confirmation password do not match. */
    AUTH_PASSWORDS_DO_NOT_MATCH("auth_passwords_do_not_match", "Passwords do not match."),

    /** Password length is below the 6-character minimum. */
    AUTH_PASSWORD_TOO_SHORT("auth_password_too_short", "Password must be at least 6 characters."),

    /** Registration succeeded confirmation prompt. */
    AUTH_REGISTER_SUCCESS("auth_register_success", "Account created successfully! Please sign in."),

    /** Account with email already exists. */
    AUTH_EMAIL_EXISTS("auth_email_exists", "An account with this email already exists."),

    /** Email already registered during inline registration. */
    AUTH_EMAIL_ALREADY_REGISTERED("auth_email_already_registered", "Email already registered"),

    /** Invalid username or password during login. */
    AUTH_INVALID_CREDENTIALS("auth_invalid_credentials", "Invalid username or password."),

    /** Network timeout user-facing message. */
    AUTH_NETWORK_TIMEOUT("auth_network_timeout", "Network timeout. Please check your connection."),

    /** Unit category is required when creating or updating an alert rule. */
    ALERT_RULE_UNIT_REQUIRED("alert_rule_unit_required", "Unit category is required"),

    /** Alert rule threshold must be between 1 and 100. */
    ALERT_RULE_THRESHOLD_RANGE("alert_rule_threshold_range", "Threshold must be between 1 and 100"),

    /** Widget title is required in the wizard. */
    WIZARD_TITLE_REQUIRED("wizard_title_required", "Title is required");

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
