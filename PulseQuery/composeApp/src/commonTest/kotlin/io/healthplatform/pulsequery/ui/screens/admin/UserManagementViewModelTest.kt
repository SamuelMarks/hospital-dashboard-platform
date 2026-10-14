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

    @Test
    fun testAllBranchesInUpdateToggleAndErrorStates(): Unit = runBlocking {
        val twoUsersJson = """
            [
                {"id":"u1","email":"carol@hospital.org","is_active":true,"is_admin":false,"role":"ANALYST"},
                {"id":"u2","email":"dave@hospital.org","is_active":true,"is_admin":false,"role":"PHYSICIAN"}
            ]
        """.trimIndent()
        val updatedU1Json = """{"id":"u1","email":"carol@hospital.org","is_active":false,"is_admin":true,"role":"ADMIN"}"""

        var failMode: String? = null
        var failMessage: String? = null
        val engine = MockEngine { request ->
            if (failMode != null) {
                throw RuntimeException(failMessage)
            }
            when {
                request.url.encodedPath.endsWith("role") -> respond(
                    updatedU1Json,
                    HttpStatusCode.OK,
                    headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                request.url.encodedPath.endsWith("status") -> respond(
                    updatedU1Json,
                    HttpStatusCode.OK,
                    headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond(
                    twoUsersJson,
                    HttpStatusCode.OK,
                    headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val client = configureClient(engine)
        val explicitApi = io.healthplatform.pulsequery.api.apis.AdminUsersApi(
            baseUrl = "http://localhost",
            httpClient = client
        )

        val vm = UserManagementViewModel(scope = this, adminUsersApi = explicitApi)
        withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Success }
        }

        // updateRole & toggleStatus with 2 users covers both true and false branches of `if (it.id == userId)`
        vm.updateRole("u1", "ADMIN")
        withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Success && it.users.first().role == "ADMIN" }
        }
        vm.toggleStatus("u1", false)
        withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Success && !it.users.first().isActive }
        }
        vm.toggleStatus("u2", false)
        kotlinx.coroutines.delay(50)

        // updateRole failure with non-null message
        failMode = "role"
        failMessage = "Role update denied"
        vm.updateRole("u1", "PHYSICIAN")
        val roleErr1 = withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Error }
        } as UserManagementUiState.Error
        assertEquals("Role update denied", roleErr1.message)

        // While in Error state, updateRole, toggleStatus, setSearchQuery, and setRoleFilter return early
        vm.updateRole("u1", "ADMIN")
        vm.toggleStatus("u1", true)
        vm.setSearchQuery("carol")
        vm.setRoleFilter("ADMIN")

        // Reload success, then updateRole failure with null message
        failMode = null
        vm.loadUsers()
        withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Success }
        }
        failMode = "role"
        failMessage = null
        vm.updateRole("u1", "PHYSICIAN")
        val roleErr2 = withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Error }
        } as UserManagementUiState.Error
        assertEquals("Failed to update role", roleErr2.message)

        // Reload success, then toggleStatus failure with non-null message
        failMode = null
        vm.loadUsers()
        withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Success }
        }
        failMode = "status"
        failMessage = "Status update denied"
        vm.toggleStatus("u1", false)
        val statusErr1 = withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Error }
        } as UserManagementUiState.Error
        assertEquals("Status update denied", statusErr1.message)

        // Reload success, then toggleStatus failure with null message (using a dedicated client throwing RuntimeException(null))
        val nullFailUserApi = io.healthplatform.pulsequery.api.apis.AdminUsersApi(
            baseUrl = "http://localhost",
            httpClient = HttpClient(MockEngine { req ->
                if (req.url.encodedPath.endsWith("status")) {
                    throw RuntimeException(null as String?)
                }
                respond(
                    twoUsersJson,
                    HttpStatusCode.OK,
                    headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }) {
                install(ContentNegotiation) {
                    json(Json { ignoreUnknownKeys = true; isLenient = true })
                }
            }
        )
        val vmNullStatus = UserManagementViewModel(scope = this, adminUsersApi = nullFailUserApi)
        withTimeout(5000) {
            vmNullStatus.state.first { it is UserManagementUiState.Success }
        }
        vmNullStatus.toggleStatus("u1", false)
        val statusErr2 = withTimeout(5000) {
            vmNullStatus.state.first { it is UserManagementUiState.Error }
        } as UserManagementUiState.Error
        assertEquals("Failed to toggle user status", statusErr2.message)

        // Load users failure with null message
        failMode = "load"
        failMessage = null
        vm.loadUsers()
        val loadErrNull = withTimeout(5000) {
            vm.state.first { it is UserManagementUiState.Error }
        } as UserManagementUiState.Error
        assertEquals("Failed to load users", loadErrNull.message)
    }
}
