/**
 * Unit tests for [AppRoute] navigation configuration, route resolution, and bottom-bar visibility rules.
 */
package io.healthplatform.pulsequery

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Validates [AppRoute] route definitions, path builders, and navigation bar visibility logic.
 */
class AppTest {

    /**
     * Verifies that [AppRoute.fromRoute] resolves known route strings and returns null for unknown or blank inputs.
     */
    @Test
    fun testFromRouteResolution() {
        assertEquals(AppRoute.LOGIN, AppRoute.fromRoute("login"))
        assertEquals(AppRoute.DASHBOARD, AppRoute.fromRoute("dashboard"))
        assertEquals(AppRoute.CHAT, AppRoute.fromRoute("chat"))
        assertEquals(AppRoute.SIMULATION, AppRoute.fromRoute("simulation"))
        assertEquals(AppRoute.TV_DASHBOARD, AppRoute.fromRoute("tv/dashboard"))
        assertEquals(AppRoute.WEAR_CENSUS, AppRoute.fromRoute("wear/census"))
        assertNull(AppRoute.fromRoute(null))
        assertNull(AppRoute.fromRoute("   "))
        assertNull(AppRoute.fromRoute("nonexistent_route"))
    }

    /**
     * Verifies that [AppRoute.shouldShowBottomBar] hides the navigation bar on login, register, wizard, TV, and Wear routes.
     */
    @Test
    fun testShouldShowBottomBar() {
        assertTrue(AppRoute.shouldShowBottomBar(null))
        assertTrue(AppRoute.shouldShowBottomBar("dashboard"))
        assertTrue(AppRoute.shouldShowBottomBar("chat"))
        assertTrue(AppRoute.shouldShowBottomBar("custom_unknown"))
        assertFalse(AppRoute.shouldShowBottomBar("login"))
        assertFalse(AppRoute.shouldShowBottomBar("register"))
        assertFalse(AppRoute.shouldShowBottomBar("wizard"))
        assertFalse(AppRoute.shouldShowBottomBar("wizard/dash-123"))
        assertFalse(AppRoute.shouldShowBottomBar("tv/dashboard"))
        assertFalse(AppRoute.shouldShowBottomBar("wear/census"))
    }

    /**
     * Verifies parameterized route builders [AppRoute.wizardRoute] and [AppRoute.mpaxArenaRoute].
     */
    @Test
    fun testParameterizedRouteBuilders() {
        assertEquals("wizard", AppRoute.wizardRoute(""))
        assertEquals("wizard", AppRoute.wizardRoute("   "))
        assertEquals("wizard/dash-99", AppRoute.wizardRoute("dash-99"))

        assertEquals("mpax_arena", AppRoute.mpaxArenaRoute(""))
        assertEquals("mpax_arena", AppRoute.mpaxArenaRoute("  "))
        assertEquals("mpax_arena?prompt=Route ICU", AppRoute.mpaxArenaRoute("Route ICU"))
    }
}
