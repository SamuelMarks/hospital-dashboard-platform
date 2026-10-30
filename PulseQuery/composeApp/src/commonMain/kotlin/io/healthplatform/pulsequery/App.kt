/**
 * Root application navigation routes and Compose entry point for PulseQuery.
 */
package io.healthplatform.pulsequery

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.components.BackendOfflineBanner
import io.healthplatform.pulsequery.ui.screens.AdminScreen
import io.healthplatform.pulsequery.ui.screens.AlertRulesScreen
import io.healthplatform.pulsequery.ui.screens.AnalyticsScreen
import io.healthplatform.pulsequery.ui.screens.BenchmarksScreen
import io.healthplatform.pulsequery.ui.screens.ChatScreen
import io.healthplatform.pulsequery.ui.screens.DashboardScreen
import io.healthplatform.pulsequery.ui.screens.EditorScreen
import io.healthplatform.pulsequery.ui.screens.LoginScreen
import io.healthplatform.pulsequery.ui.screens.OptimizationScreen
import io.healthplatform.pulsequery.ui.screens.RegisterScreen
import io.healthplatform.pulsequery.ui.screens.admin.UserManagementScreen
import io.healthplatform.pulsequery.ui.screens.wizard.WizardScreen
import io.healthplatform.pulsequery.ui.theme.PulseQueryTheme

/**
 * Strongly typed navigation routes for the PulseQuery Compose Multiplatform navigation graph.
 *
 * @property route Route pattern string registered in the `NavHost`.
 * @property showBottomBar Whether the primary bottom navigation bar should be displayed on this route.
 */
enum class AppRoute(
    val route: String,
    val showBottomBar: Boolean
) {
    /** Login authentication screen route. */
    LOGIN("login", false),

    /** New user registration screen route. */
    REGISTER("register", false),

    /** Primary hospital command center dashboard screen route. */
    DASHBOARD("dashboard", true),

    /** Parameterized widget creation wizard route for a specific dashboard. */
    WIZARD_WITH_DASHBOARD("wizard/{dashboardId}", false),

    /** Standalone widget creation wizard route. */
    WIZARD("wizard", false),

    /** Conversational AI assistant screen route. */
    CHAT("chat", true),

    /** LLM Arena analytics screen route. */
    ANALYTICS("analytics", true),

    /** Clinical bed occupancy alert rules screen route. */
    ALERT_RULES("alert_rules", true),

    /** Ad-hoc SQL editor screen route. */
    EDITOR("editor", true),

    /** LLM + JAX + MPAX Hospital Operations Optimization screen route. */
    OPTIMIZATION("optimization", true),

    /** Optimization screen route pre-populated with a benchmark prompt. */
    OPTIMIZATION_WITH_PROMPT("optimization?prompt={prompt}", true),

    /** Text-to-SQL and Hospital Optimization benchmark suite screen route. */
    BENCHMARKS("benchmarks", true),

    /** System administration configuration screen route. */
    ADMIN("admin", true),

    /** Privileged user directory and role management screen route. */
    ADMIN_USERS("admin/users", true),

    /** Passive 10-foot TV wallboard dashboard route. */
    TV_DASHBOARD("tv/dashboard", false),

    /** Compact smartwatch companion census route. */
    WEAR_CENSUS("wear/census", false);

    /**
     * Companion utilities for resolving and formatting [AppRoute] destination strings.
     */
    companion object {
        /**
         * Resolves an [AppRoute] matching a raw navigation destination route string.
         *
         * @param route Raw destination route string, or null.
         * @return Matching [AppRoute], or null if unrecognized.
         */
        fun fromRoute(route: String?): AppRoute? {
            if (route.isNullOrBlank()) return null
            return entries.firstOrNull { it.route == route }
        }

        /**
         * Determines whether the bottom navigation bar should be visible for [route].
         *
         * @param route Raw destination route string, or null.
         * @return `true` when the bottom navigation bar should be rendered.
         */
        fun shouldShowBottomBar(route: String?): Boolean {
            if (route == null) return true
            if (route.startsWith("wizard")) return false
            return fromRoute(route)?.showBottomBar ?: true
        }

        /**
         * Formats the wizard navigation destination path for a specific [dashboardId].
         *
         * @param dashboardId Target dashboard UUID string.
         * @return Formatted navigation path string.
         */
        fun wizardRoute(dashboardId: String): String =
            if (dashboardId.isBlank()) WIZARD.route else "wizard/$dashboardId"

        /**
         * Formats the Hospital Optimization navigation destination path with an optional [prompt].
         *
         * @param prompt Optional scenario prompt string.
         * @return Formatted navigation path string.
         */
        fun optimizationRoute(prompt: String): String =
            if (prompt.isBlank()) OPTIMIZATION.route else "optimization?prompt=$prompt"
    }
}

/**
 * Root Compose entry point handling Theme injection and Jetpack Navigation routing.
 */
@Composable
fun App() {
    PulseQueryTheme {
        val navController = rememberNavController()
        val navBackStackEntry by navController.currentBackStackEntryAsState()
        val currentDestination = navBackStackEntry?.destination

        val isOnline by AppContainer.networkHealthRepository.isOnline.collectAsState()
        val isChecking by AppContainer.networkHealthRepository.isChecking.collectAsState()

        LaunchedEffect(Unit) {
            AppContainer.networkHealthRepository.checkHealth()
        }

        val items = listOf(
            AppRoute.DASHBOARD.route to Icons.Filled.Dashboard,
            AppRoute.CHAT.route to Icons.AutoMirrored.Filled.Chat,
            AppRoute.ANALYTICS.route to Icons.Filled.Analytics,
            AppRoute.EDITOR.route to Icons.Filled.Edit,
            AppRoute.OPTIMIZATION.route to Icons.Filled.Science,
            AppRoute.ADMIN.route to Icons.Filled.Settings
        )

        Scaffold(
            topBar = {
                if (!isOnline) {
                    BackendOfflineBanner(
                        onRetry = { AppContainer.networkHealthRepository.refreshHealth() },
                        isRetrying = isChecking
                    )
                }
            },
            bottomBar = {
                if (AppRoute.shouldShowBottomBar(currentDestination?.route)) {
                    NavigationBar {
                        items.forEach { (route, icon) ->
                            NavigationBarItem(
                                icon = { Icon(icon, contentDescription = null) },
                                label = { Text(route.replaceFirstChar { it.uppercase() }) },
                                selected = currentDestination?.hierarchy?.any { it.route == route } == true,
                                onClick = {
                                    navController.navigate(route) {
                                        popUpTo(AppRoute.DASHBOARD.route) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            )
                        }
                    }
                }
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = AppRoute.LOGIN.route,
                modifier = Modifier.padding(innerPadding).fillMaxSize()
            ) {
                composable(AppRoute.LOGIN.route) {
                    LoginScreen(
                        onLoginSuccess = {
                            navController.navigate(AppRoute.DASHBOARD.route) {
                                popUpTo(AppRoute.LOGIN.route) { inclusive = true }
                            }
                        },
                        onNavigateToRegister = {
                            navController.navigate(AppRoute.REGISTER.route)
                        }
                    )
                }
                composable(AppRoute.REGISTER.route) {
                    RegisterScreen(
                        onRegisterSuccess = {
                            navController.navigate(AppRoute.LOGIN.route) {
                                popUpTo(AppRoute.REGISTER.route) { inclusive = true }
                            }
                        },
                        onNavigateToLogin = {
                            navController.popBackStack()
                        }
                    )
                }
                composable(AppRoute.DASHBOARD.route) {
                    DashboardScreen(
                        onAddWidget = { dashboardId ->
                            navController.navigate(AppRoute.wizardRoute(dashboardId))
                        }
                    )
                }
                composable(AppRoute.WIZARD_WITH_DASHBOARD.route) { backStackEntry ->
                    val dashboardId = backStackEntry.savedStateHandle.get<String>("dashboardId") ?: ""
                    WizardScreen(
                        dashboardId = dashboardId,
                        onComplete = { navController.popBackStack() },
                        onBack = { navController.popBackStack() }
                    )
                }
                composable(AppRoute.WIZARD.route) {
                    WizardScreen(
                        dashboardId = "",
                        onComplete = { navController.popBackStack() },
                        onBack = { navController.popBackStack() }
                    )
                }
                composable(AppRoute.CHAT.route) { ChatScreen(conversationId = null) }
                composable(AppRoute.ANALYTICS.route) {
                    AnalyticsScreen(
                        onNavigateToAlertRules = { navController.navigate(AppRoute.ALERT_RULES.route) }
                    )
                }
                composable(AppRoute.ALERT_RULES.route) { AlertRulesScreen() }
                composable(AppRoute.EDITOR.route) { EditorScreen() }
                composable(AppRoute.OPTIMIZATION.route) { OptimizationScreen() }
                composable(AppRoute.OPTIMIZATION_WITH_PROMPT.route) { backStackEntry ->
                    val scenarioPrompt = backStackEntry.savedStateHandle.get<String>("prompt")
                    OptimizationScreen(initialPrompt = scenarioPrompt)
                }
                composable(AppRoute.BENCHMARKS.route) {
                    BenchmarksScreen(
                        onSimulateMpax = { prompt ->
                            navController.navigate(AppRoute.optimizationRoute(prompt))
                        }
                    )
                }
                composable(AppRoute.ADMIN.route) {
                    AdminScreen(
                        onNavigateToUserManagement = { navController.navigate(AppRoute.ADMIN_USERS.route) }
                    )
                }
                composable(AppRoute.ADMIN_USERS.route) {
                    UserManagementScreen(
                        onNavigateBack = { navController.popBackStack() }
                    )
                }
                composable(AppRoute.TV_DASHBOARD.route) {
                    io.healthplatform.pulsequery.ui.screens.tv.TvDashboardScreen(
                        onExit = { navController.popBackStack() }
                    )
                }
                composable(AppRoute.WEAR_CENSUS.route) {
                    io.healthplatform.pulsequery.ui.screens.wear.WearCensusScreen(
                        onExit = { navController.popBackStack() }
                    )
                }
            }
        }
    }
}
