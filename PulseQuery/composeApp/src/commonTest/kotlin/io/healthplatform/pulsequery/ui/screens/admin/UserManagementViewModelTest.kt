package io.healthplatform.pulsequery.ui.screens.admin

import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

/**
 * Unit tests verifying state transitions, network delegations, and filter mechanics
 * in [UserManagementViewModel].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class UserManagementViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
        AppContainer.resetForTest()
    }

    private fun configureClient(engine: MockEngine): HttpClient {
        val client = HttpClient(engine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
        return client
    }

    @Test
    fun testInitialLoadSuccess(): Unit = runBlocking {
        val mockUsersJson = """
            [
                {"id":"u1","email":"alice@hospital.org","is_active":true,"is_admin":false,"role":"PHYSICIAN"},
                {"id":"u2","email":"bob@hospital.org","is_active":true,"is_admin":false,"role":"CHARGE_NURSE"}
            ]
        """.trimIndent()

        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("admin/users") -> {
                    respond(
                        mockUsersJson,
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        configureClient(engine)

        val viewModel = UserManagementViewModel(scope = this)
        val state = withTimeout(5000) {
            viewModel.state.first { it !is UserManagementUiState.Loading }
        }

        assertIs<UserManagementUiState.Success>(state)
        assertEquals(2, state.users.size)
        assertEquals("alice@hospital.org", state.users[0].email)
    }

    @Test
    fun testInitialLoadFailure(): Unit = runBlocking {
        val engine = MockEngine {
            respond("Internal Server Error", HttpStatusCode.InternalServerError)
        }
        configureClient(engine)

        val viewModel = UserManagementViewModel(scope = this)
        val state = withTimeout(5000) {
            viewModel.state.first { it !is UserManagementUiState.Loading }
        }

        assertIs<UserManagementUiState.Error>(state)
    }

    @Test
    fun testUpdateRoleSuccess(): Unit = runBlocking {
        val initialUsersJson = """[{"id":"u1","email":"carol@hospital.org","is_active":true,"is_admin":false,"role":"ANALYST"}]"""
        val updatedUserJson = """{"id":"u1","email":"carol@hospital.org","is_active":true,"is_admin":true,"role":"ADMIN"}"""

        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.endsWith("role") -> {
                    respond(
                        updatedUserJson,
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("admin/users") -> {
                    respond(
                        initialUsersJson,
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        configureClient(engine)

        val viewModel = UserManagementViewModel(scope = this)
        withTimeout(5000) {
            viewModel.state.first { it !is UserManagementUiState.Loading }
        }

        viewModel.updateRole("u1", "ADMIN")

        val updatedState = withTimeout(5000) {
            viewModel.state.first {
                it is UserManagementUiState.Success && it.users.firstOrNull()?.role == "ADMIN"
            }
        }

        assertIs<UserManagementUiState.Success>(updatedState)
        assertEquals("ADMIN", updatedState.users[0].role)
    }

    @Test
    fun testToggleStatusSuccess(): Unit = runBlocking {
        val initialUsersJson = """[{"id":"u1","email":"dan@hospital.org","is_active":true,"is_admin":false,"role":"PHYSICIAN"}]"""
        val suspendedUserJson = """{"id":"u1","email":"dan@hospital.org","is_active":false,"is_admin":false,"role":"PHYSICIAN"}"""

        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.endsWith("status") -> {
                    respond(
                        suspendedUserJson,
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("admin/users") -> {
                    respond(
                        initialUsersJson,
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        configureClient(engine)

        val viewModel = UserManagementViewModel(scope = this)
        withTimeout(5000) {
            viewModel.state.first { it !is UserManagementUiState.Loading }
        }

        viewModel.toggleStatus("u1", false)

        val updatedState = withTimeout(5000) {
            viewModel.state.first {
                it is UserManagementUiState.Success && it.users.firstOrNull()?.isActive == false
            }
        }

        assertIs<UserManagementUiState.Success>(updatedState)
        assertEquals(false, updatedState.users[0].isActive)
    }

    @Test
    fun testFilteringByQueryAndRole(): Unit = runBlocking {
        val usersJson = """
            [
                {"id":"u1","email":"alice@alpha.org","is_active":true,"is_admin":false,"role":"PHYSICIAN"},
                {"id":"u2","email":"alex@alpha.org","is_active":true,"is_admin":false,"role":"CHARGE_NURSE"},
                {"id":"u3","email":"bob@beta.org","is_active":true,"is_admin":false,"role":"PHYSICIAN"}
            ]
        """.trimIndent()

        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("admin/users") -> {
                    respond(
                        usersJson,
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        configureClient(engine)

        val viewModel = UserManagementViewModel(scope = this)
        val loadedState = withTimeout(5000) {
            viewModel.state.first { it !is UserManagementUiState.Loading }
        }
        assertIs<UserManagementUiState.Success>(loadedState)

        // Filter by text query "al" (matches alice and alex, but not bob@beta.org)
        viewModel.setSearchQuery("al")
        val searchState = viewModel.state.value
        assertIs<UserManagementUiState.Success>(searchState)
        assertEquals(2, searchState.users.size)

        // Filter by role "PHYSICIAN" (matches alice only)
        viewModel.setRoleFilter("PHYSICIAN")
        val combinedState = viewModel.state.value
        assertIs<UserManagementUiState.Success>(combinedState)
        assertEquals(1, combinedState.users.size)
        assertEquals("alice@alpha.org", combinedState.users[0].email)

        // Clear role filter (matches alice and alex)
        viewModel.setRoleFilter(null)
        val clearedRoleState = viewModel.state.value
        assertIs<UserManagementUiState.Success>(clearedRoleState)
        assertNull(clearedRoleState.selectedRole)
        assertEquals(2, clearedRoleState.users.size)
    }
}
