package io.healthplatform.pulsequery

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
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
        Surface(
            modifier = Modifier.fillMaxSize()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .safeDrawingPadding() // Automatically handle system insets
            ) {
                val navController = rememberNavController()

                NavHost(
                    navController = navController,
                    startDestination = "login",
                    modifier = Modifier.fillMaxSize()
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

                    composable("dashboard") {
                        DashboardScreen(
                            onNavigateToChat = { navController.navigate("chat") },
                            onNavigateToAnalytics = { navController.navigate("analytics") },
                            onNavigateToSimulation = { navController.navigate("simulation") },
                            onNavigateToAdmin = { navController.navigate("admin") },
                            onNavigateToEditor = { navController.navigate("editor") }
                        )
                    }
                    
                    composable("chat") {
                        ChatScreen(
                            conversationId = null,
                            onNavigateBack = { navController.popBackStack() }
                        )
                    }

                    composable("analytics") {
                        AnalyticsScreen(
                            onNavigateBack = { navController.popBackStack() }
                        )
                    }

                    composable("simulation") {
                        SimulationScreen(
                            onNavigateBack = { navController.popBackStack() }
                        )
                    }

                    composable("admin") {
                        AdminScreen(
                            onNavigateBack = { navController.popBackStack() }
                        )
                    }

                    composable("editor") {
                        EditorScreen(
                            onNavigateBack = { navController.popBackStack() }
                        )
                    }
                }
            }
        }
    }
}
