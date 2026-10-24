/**
 * Repository for consuming real-time Server-Sent Events (SSE) token streams during Chat Arena interactions.
 */
package io.healthplatform.pulsequery.network

import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulse
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.request.headers
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Strongly typed events emitted during an SSE conversation token stream.
 */
sealed interface ChatStreamEvent {
    /**
     * Stream session initiated on the server.
     *
     * @property conversationId Unique identifier of the active conversation.
     */
    data class StreamStarted(val conversationId: String) : ChatStreamEvent

    /**
     * An incremental token chunk emitted by the generating model.
     *
     * @property token Incremental text token emitted by the model.
     */
    data class TokenChunk(val token: String) : ChatStreamEvent

    /**
     * The assistant response generation completed and persisted to storage.
     *
     * @property messageId Persisted assistant message identifier.
     * @property content Complete generated response text.
     * @property sqlSnippet Extracted SQL query snippet, if present.
     */
    data class StreamDone(val messageId: String, val content: String, val sqlSnippet: String?) : ChatStreamEvent

    /**
     * A fatal failure occurred during streaming.
     *
     * @property message Human-readable error description.
     */
    data class StreamError(val message: String) : ChatStreamEvent
}

/**
 * Raw JSON payload deserialized from Server-Sent Event data packets.
 *
 * @property event The event discriminator ("start", "token", "done", "error").
 * @property conversationId The conversation ID if event is "start".
 * @property token The token string if event is "token".
 * @property messageId The persisted message ID if event is "done".
 * @property content The full text content if event is "done".
 * @property sqlSnippet The extracted SQL snippet if event is "done".
 * @property error Error description if event is "error".
 */
@Serializable
data class SsePacket(
    val event: String,
    @SerialName("conversation_id")
    val conversationId: String? = null,
    val token: String? = null,
    @SerialName("message_id")
    val messageId: String? = null,
    val content: String? = null,
    @SerialName("sql_snippet")
    val sqlSnippet: String? = null,
    val error: String? = null
)

/**
 * Repository orchestrating Server-Sent Events token streaming for chat.
 *
 * @param httpClient Optional HTTP client override for testing.
 * @param baseUrlProvider Function resolving the active base URL.
 */
class ChatStreamingRepository(
    private val httpClient: HttpClient? = null,
    private val baseUrlProvider: () -> String = { AppContainer.currentBaseUrl }
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * Streams incoming tokens for the designated conversation.
     *
     * @param conversationId UUID string of the conversation being streamed.
     * @param token Optional authorization bearer token.
     * @param modelId Optional target model ID for the generation.
     * @return Flow emitting [ChatStreamEvent] states in real time.
     */
    fun streamTokens(
        conversationId: String,
        token: String? = AppContainer.currentToken,
        modelId: String? = null
    ): Flow<ChatStreamEvent> = channelFlow {
        val client = httpClient ?: AppContainer.httpClient
        val url = buildStreamUrl(conversationId, modelId)

        runCatchingPulseAsync {
            client.prepareGet(url) {
                headers {
                    append(HttpHeaders.Accept, "text/event-stream")
                    if (!token.isNullOrBlank()) {
                        append(HttpHeaders.Authorization, "Bearer $token")
                    }
                }
            }.execute { response ->
                processStreamResponse(response, conversationId)
            }
        }.onFailure { e ->
            send(ChatStreamEvent.StreamError(e.messageOrDefault("Network error during token streaming")))
        }
    }

    /**
     * Constructs the target SSE endpoint URL for a conversation and optional model ID.
     *
     * @param conversationId Target conversation UUID.
     * @param modelId Optional model identifier query parameter.
     * @return Full HTTP URL string for the SSE stream endpoint.
     */
    private fun buildStreamUrl(conversationId: String, modelId: String?): String {
        val base = baseUrlProvider().trimEnd('/')
        return if (modelId != null) {
            "$base/api/v1/chat/stream/$conversationId?model_id=$modelId"
        } else {
            "$base/api/v1/chat/stream/$conversationId"
        }
    }

    /**
     * Reads lines from the SSE [HttpResponse] and dispatches parsed [ChatStreamEvent] items.
     *
     * @param response Active Ktor [HttpResponse] stream.
     * @param conversationId Fallback conversation ID if omitted from the start packet.
     */
    private suspend fun ProducerScope<ChatStreamEvent>.processStreamResponse(
        response: HttpResponse,
        conversationId: String
    ) {
        if (!response.status.isSuccess()) {
            send(ChatStreamEvent.StreamError("Server returned ${response.status}"))
            return
        }
        val rawText = response.bodyAsText()
        for (line in rawText.lineSequence()) {
            val jsonText = extractSseDataPayload(line)
            if (jsonText != null) {
                emitPacketEvent(jsonText, conversationId)
            }
        }
    }

    /**
     * Extracts the JSON payload following the `data:` prefix in an SSE line.
     *
     * @param line Raw line from the SSE body.
     * @return Non-empty JSON payload string, or null if the line is not a data frame.
     */
    private fun extractSseDataPayload(line: String): String? {
        val trimmed = line.trim()
        if (!trimmed.startsWith("data:")) return null
        return trimmed.removePrefix("data:").trim().takeIf { it.isNotEmpty() }
    }

    /**
     * Decodes a raw JSON string into an [SsePacket] using [Result] and emits the mapped [ChatStreamEvent].
     *
     * @param jsonText Raw JSON string from an SSE `data:` frame.
     * @param conversationId Fallback conversation identifier.
     */
    private suspend fun ProducerScope<ChatStreamEvent>.emitPacketEvent(
        jsonText: String,
        conversationId: String
    ) {
        val packet = runCatchingPulse { json.decodeFromString<SsePacket>(jsonText) }.getOrNull() ?: return
        val event = mapPacketToEvent(packet, conversationId)
        if (event != null) {
            send(event)
        }
    }

    /**
     * Maps a deserialized [SsePacket] to its corresponding domain [ChatStreamEvent].
     *
     * @param packet Deserialized SSE packet payload.
     * @param fallbackConversationId Conversation ID used if [SsePacket.conversationId] is null.
     * @return Corresponding [ChatStreamEvent] or null for unrecognized heartbeats.
     */
    private fun mapPacketToEvent(packet: SsePacket, fallbackConversationId: String): ChatStreamEvent? {
        return when (packet.event) {
            "start" -> ChatStreamEvent.StreamStarted(packet.conversationId ?: fallbackConversationId)
            "token" -> packet.token?.let { ChatStreamEvent.TokenChunk(it) }
            "done" -> ChatStreamEvent.StreamDone(
                messageId = packet.messageId ?: "",
                content = packet.content ?: "",
                sqlSnippet = packet.sqlSnippet
            )
            "error" -> ChatStreamEvent.StreamError(packet.error ?: "Streaming failed")
            else -> null
        }
    }
}
