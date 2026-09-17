/**
 * Repository for consuming real-time Server-Sent Events (SSE) token streams during Chat Arena interactions.
 */
package io.healthplatform.pulsequery.network

import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.request.headers
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Strongly typed events emitted during an SSE conversation token stream.
 */
sealed interface ChatStreamEvent {
    /** Stream session initiated on the server. */
    data class StreamStarted(val conversationId: String) : ChatStreamEvent
    /** An incremental token chunk emitted by the generating model. */
    data class TokenChunk(val token: String) : ChatStreamEvent
    /** The assistant response generation completed and persisted to storage. */
    data class StreamDone(val messageId: String, val content: String, val sqlSnippet: String?) : ChatStreamEvent
    /** A fatal failure occurred during streaming. */
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
        val base = baseUrlProvider().trimEnd('/')
        val url = buildString {
            append("$base/api/v1/chat/stream/$conversationId")
            if (modelId != null) {
                append("?model_id=$modelId")
            }
        }

        runCatching {
            client.prepareGet(url) {
                headers {
                    append(HttpHeaders.Accept, "text/event-stream")
                    if (!token.isNullOrBlank()) {
                        append(HttpHeaders.Authorization, "Bearer $token")
                    }
                }
            }.execute { response ->
                if (!response.status.isSuccess()) {
                    send(ChatStreamEvent.StreamError("Server returned ${response.status}"))
                    return@execute
                }
                val rawText = response.bodyAsText()
                for (line in rawText.lineSequence()) {
                    val trimmed = line.trim()
                    if (trimmed.startsWith("data:")) {
                        val jsonText = trimmed.removePrefix("data:").trim()
                        if (jsonText.isNotEmpty()) {
                            runCatching {
                                json.decodeFromString<SsePacket>(jsonText)
                            }.onSuccess { packet ->
                                when (packet.event) {
                                    "start" -> send(ChatStreamEvent.StreamStarted(packet.conversationId ?: conversationId))
                                    "token" -> packet.token?.let { send(ChatStreamEvent.TokenChunk(it)) }
                                    "done" -> send(
                                        ChatStreamEvent.StreamDone(
                                            messageId = packet.messageId ?: "",
                                            content = packet.content ?: "",
                                            sqlSnippet = packet.sqlSnippet
                                        )
                                    )
                                    "error" -> send(ChatStreamEvent.StreamError(packet.error ?: "Streaming failed"))
                                }
                            }
                        }
                    }
                }
            }
        }.onFailure { e ->
            send(ChatStreamEvent.StreamError(e.message ?: "Network error during token streaming"))
        }
    }
}
