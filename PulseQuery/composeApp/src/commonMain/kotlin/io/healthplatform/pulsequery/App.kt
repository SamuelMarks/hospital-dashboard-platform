package io.healthplatform.pulsequery

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Chat
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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import io.healthplatform.pulsequery.ui.screens.AdminScreen
import io.healthplatform.pulsequery.ui.screens.AnalyticsScreen
import io.healthplatform.pulsequery.ui.screens.ChatScreen
import io.healthplatform.pulsequery.ui.screens.DashboardScreen
import io.healthplatform.pulsequery.ui.screens.EditorScreen
import io.healthplatform.pulsequery.ui.screens.LoginScreen
import io.healthplatform.pulsequery.ui.screens.SimulationScreen
import io.healthplatform.pulsequery.ui.theme.PulseQueryTheme

/**
 * Root Compose entry point handling Theme injection and Jetpack Navigation routing.
 */
@Composable
fun App() {
    PulseQueryTheme {
        val navController = rememberNavController()
        val navBackStackEntry by navController.currentBackStackEntryAsState()
        val currentDestination = navBackStackEntry?.destination

        val items = listOf(
            "dashboard" to Icons.Filled.Dashboard,
            "chat" to Icons.Filled.Chat,
            "analytics" to Icons.Filled.Analytics,
            "editor" to Icons.Filled.Edit,
            "simulation" to Icons.Filled.Science,
            "admin" to Icons.Filled.Settings
        )

        Scaffold(
            bottomBar = {
                if (currentDestination?.route != "login") {
                    NavigationBar {
                        items.forEach { (route, icon) ->
                            NavigationBarItem(
                                icon = { Icon(icon, contentDescription = route) },
                                label = { Text(route.replaceFirstChar { it.uppercase() }) },
                                selected = currentDestination?.hierarchy?.any { it.route == route } == true,
                                onClick = {
                                    navController.navigate(route) {
                                        popUpTo("dashboard") { saveState = true }
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
                startDestination = "login",
                modifier = Modifier.padding(innerPadding).fillMaxSize()
            ) {
                composable("login") {
                    LoginScreen(
                        onLoginSuccess = {
                            navController.navigate("dashboard") {
                                popUpTo("login") { inclusive = true }
                            }
                        }
                    )
                }
                composable("dashboard") { DashboardScreen() }
                composable("chat") { ChatScreen(conversationId = null) }
                composable("analytics") { AnalyticsScreen() }
                composable("editor") { EditorScreen() }
                composable("simulation") { SimulationScreen() }
                composable("admin") { AdminScreen() }
            }
        }
    }
}
