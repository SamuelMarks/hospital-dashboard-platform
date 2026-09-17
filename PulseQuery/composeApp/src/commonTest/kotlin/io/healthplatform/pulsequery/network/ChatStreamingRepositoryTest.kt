package io.healthplatform.pulsequery.network

import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsText
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests verifying [ChatStreamingRepository] Server-Sent Events parsing and flow emission.
 */
class ChatStreamingRepositoryTest {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    @Test
    fun testStreamTokensSuccessSequence() = runTest {
        val dq = 34.toChar()
        val nl = 10.toChar()
        val sep = "$nl$nl"
        val p1 = "data: {$dq" + "event$dq:$dq" + "start$dq,$dq" + "conversation_id$dq:$dq" + "conv-1$dq}"
        val p2 = "data: {$dq" + "event$dq:$dq" + "token$dq,$dq" + "token$dq:$dq" + "SELECT $dq}"
        val p3 = "data: {$dq" + "event$dq:$dq" + "token$dq,$dq" + "token$dq:$dq" + "count(*) $dq}"
        val p4 = "data: {$dq" + "event$dq:$dq" + "token$dq,$dq" + "token$dq:$dq" + "FROM admissions;$dq}"
        val p5 = "data: {$dq" + "event$dq:$dq" + "done$dq,$dq" + "message_id$dq:$dq" + "msg-1$dq,$dq" + "content$dq:$dq" + "SELECT count(*) FROM admissions;$dq,$dq" + "sql_snippet$dq:$dq" + "SELECT count(*) FROM admissions;$dq}"
        val ssePayload = p1 + sep + p2 + sep + p3 + sep + p4 + sep + p5 + sep

        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("chat/stream") -> {
                    respond(
                        content = ssePayload,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "text/event-stream")
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine)
        val repo = ChatStreamingRepository(httpClient = client)

        val events = repo.streamTokens("conv-1", token = "test-token", modelId = "gpt-4o").toList()

        assertEquals(5, events.size)
        assertTrue(events[0] is ChatStreamEvent.StreamStarted)
        assertEquals("conv-1", (events[0] as ChatStreamEvent.StreamStarted).conversationId)

        assertTrue(events[1] is ChatStreamEvent.TokenChunk)
        assertEquals("SELECT ", (events[1] as ChatStreamEvent.TokenChunk).token)

        assertTrue(events[2] is ChatStreamEvent.TokenChunk)
        assertEquals("count(*) ", (events[2] as ChatStreamEvent.TokenChunk).token)

        assertTrue(events[3] is ChatStreamEvent.TokenChunk)
        assertEquals("FROM admissions;", (events[3] as ChatStreamEvent.TokenChunk).token)

        assertTrue(events[4] is ChatStreamEvent.StreamDone)
        val done = events[4] as ChatStreamEvent.StreamDone
        assertEquals("msg-1", done.messageId)
        assertEquals("SELECT count(*) FROM admissions;", done.content)
        assertEquals("SELECT count(*) FROM admissions;", done.sqlSnippet)
    }

    @Test
    fun testStreamTokensErrorEvent() = runTest {
        val dq = 34.toChar()
        val nl = 10.toChar()
        val ssePayload = "data: {$dq" + "event$dq:$dq" + "error$dq,$dq" + "error$dq:$dq" + "Context window exceeded$dq}$nl$nl"

        val mockEngine = MockEngine {
            respond(
                content = ByteReadChannel(ssePayload.encodeToByteArray()),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "text/event-stream")
            )
        }
        val client = HttpClient(mockEngine)
        val repo = ChatStreamingRepository(httpClient = client)

        val events = repo.streamTokens("conv-1").toList()

        assertEquals(1, events.size)
        assertTrue(events[0] is ChatStreamEvent.StreamError)
        assertEquals("Context window exceeded", (events[0] as ChatStreamEvent.StreamError).message)
    }

    @Test
    fun testStreamTokensNetworkException() = runTest {
        val mockEngine = MockEngine {
            respond("Internal Server Error", HttpStatusCode.InternalServerError)
        }
        val client = HttpClient(mockEngine)
        val repo = ChatStreamingRepository(httpClient = client)

        val events = repo.streamTokens("conv-1").toList()
        assertTrue(events.isNotEmpty())
    }

    @Test
    fun testStreamTokensMalformedJsonSkipped() = runTest {
        val dq = 34.toChar()
        val nl = 10.toChar()
        val ssePayload = "data: not-a-valid-json$nl$nl" + "data: {$dq" + "event$dq:$dq" + "token$dq,$dq" + "token$dq:$dq" + "valid$dq}$nl$nl"

        val mockEngine = MockEngine {
            respond(
                content = ByteReadChannel(ssePayload.encodeToByteArray()),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "text/event-stream")
            )
        }
        val client = HttpClient(mockEngine)
        val repo = ChatStreamingRepository(httpClient = client)

        val events = repo.streamTokens("conv-1").toList()

        assertEquals(1, events.size)
        assertTrue(events[0] is ChatStreamEvent.TokenChunk)
        assertEquals("valid", (events[0] as ChatStreamEvent.TokenChunk).token)
    }

    @Test
    fun testSsePacketModel() {
        val packet = SsePacket(
            event = "token",
            token = "hello",
            conversationId = "c1",
            messageId = "m1",
            content = "full",
            sqlSnippet = "SELECT 1",
            error = null
        )
        assertEquals("token", packet.event)
        assertEquals("hello", packet.token)
        assertEquals("c1", packet.conversationId)
        assertEquals("m1", packet.messageId)
        assertEquals("full", packet.content)
        assertEquals("SELECT 1", packet.sqlSnippet)
    }
}
