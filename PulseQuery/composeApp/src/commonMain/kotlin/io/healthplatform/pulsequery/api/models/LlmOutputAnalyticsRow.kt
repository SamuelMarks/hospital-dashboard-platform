/**
 * Flattened analytics row model for LLM candidate outputs and user selection telemetry.
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

import kotlinx.serialization.Required
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Flattened analytics row for LLM candidate outputs.
 *
 * @property source Originating subsystem ("chat" or "ai").
 * @property candidateId Unique identifier of the generated candidate.
 * @property userId Identifier of the user who triggered generation.
 * @property userEmail Email address of the requesting user.
 * @property llm Model identifier of the LLM provider.
 * @property isSelected Whether the user voted/selected this candidate as best.
 * @property createdAt Timestamp when the candidate was generated.
 * @property assistantMessageId Optional parent assistant message ID.
 * @property conversationId Optional parent conversation ID.
 * @property conversationTitle Optional title of the conversation.
 * @property queryText Optional user prompt text that triggered generation.
 * @property promptStrategy Optional prompt engineering strategy tag.
 * @property sqlSnippet Optional generated SQL query snippet.
 * @property sqlHash Optional hash of the normalized SQL query.
 */
@Serializable
data class LlmOutputAnalyticsRow(
    @SerialName(value = "source") @Required val source: LlmOutputAnalyticsRow.Source,
    @SerialName(value = "candidate_id") @Required val candidateId: kotlin.String,
    @SerialName(value = "user_id") @Required val userId: kotlin.String,
    @SerialName(value = "user_email") @Required val userEmail: kotlin.String,
    @SerialName(value = "llm") @Required val llm: kotlin.String,
    @SerialName(value = "is_selected") @Required val isSelected: kotlin.Boolean,
    @SerialName(value = "created_at") @Required val createdAt: kotlin.time.Instant,
    @SerialName(value = "assistant_message_id") val assistantMessageId: kotlin.String? = null,
    @SerialName(value = "conversation_id") val conversationId: kotlin.String? = null,
    @SerialName(value = "conversation_title") val conversationTitle: kotlin.String? = null,
    @SerialName(value = "query_text") val queryText: kotlin.String? = null,
    @SerialName(value = "prompt_strategy") val promptStrategy: kotlin.String? = null,
    @SerialName(value = "sql_snippet") val sqlSnippet: kotlin.String? = null,
    @SerialName(value = "sql_hash") val sqlHash: kotlin.String? = null
) {

    /**
     * Originating subsystem for an LLM output analytics record.
     *
     * @property value Wire string representation ("chat" or "ai").
     */
    @Serializable
    enum class Source(val value: kotlin.String) {
        /** Conversational Chat Arena subsystem. */
        @SerialName(value = "chat")
        chat("chat"),

        /** Direct AI SQL generation subsystem. */
        @SerialName(value = "ai")
        ai("ai")
    }
}
