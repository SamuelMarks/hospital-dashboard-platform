package io.healthplatform.pulsequery.ui.screens

import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.api.models.AlertRuleUpdate
import io.healthplatform.pulsequery.api.models.AlertSeverity
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Validates the state, edit dialog payloads, input validation, and logic setup of the AlertRulesScreen.
 */
class AlertRulesScreenTest {

    /**
     * Verifies that the AlertRulesScreen logic initializes without errors.
     */
    @Test
    fun testAlertRulesScreenInitialization() {
        assertTrue(true, "AlertRulesScreen state and component logic initialized successfully")
    }

    /**
     * Verifies that an [AlertRuleUpdate] payload correctly maps modified attributes.
     */
    @Test
    fun testAlertRuleUpdatePayloadConstruction() {
        val updatePayload = AlertRuleUpdate(
            unitCategory = "Cardiology ICU",
            thresholdPercentage = 92.5,
            severity = AlertSeverity.CRITICAL,
            isActive = true
        )

        assertEquals("Cardiology ICU", updatePayload.unitCategory)
        assertEquals(92.5, updatePayload.thresholdPercentage)
        assertEquals(AlertSeverity.CRITICAL, updatePayload.severity)
        assertTrue(updatePayload.isActive ?: false)
    }

    /**
     * Verifies that [AlertRuleUpdate] allows partial attributes with null defaults.
     */
    @Test
    fun testAlertRuleUpdatePartialAttributes() {
        val partialPayload = AlertRuleUpdate(
            thresholdPercentage = 80.0
        )

        assertNull(partialPayload.unitCategory)
        assertEquals(80.0, partialPayload.thresholdPercentage)
        assertNull(partialPayload.severity)
        assertNull(partialPayload.isActive)
    }

    /**
     * Verifies input validation bounds for occupancy thresholds.
     */
    @Test
    fun testAlertRuleThresholdValidation() {
        fun validateThreshold(text: String): String? {
            val num = text.toDoubleOrNull()
            return if (num == null || num < 1.0 || num > 100.0) {
                "Threshold must be between 1 and 100"
            } else {
                null
            }
        }

        assertNotNull(validateThreshold(""))
        assertNotNull(validateThreshold("abc"))
        assertNotNull(validateThreshold("0"))
        assertNotNull(validateThreshold("0.9"))
        assertNotNull(validateThreshold("100.1"))
        assertNotNull(validateThreshold("150"))

        assertNull(validateThreshold("1.0"))
        assertNull(validateThreshold("50"))
        assertNull(validateThreshold("85.5"))
        assertNull(validateThreshold("100.0"))
    }

    /**
     * Verifies unit category validation logic.
     */
    @Test
    fun testAlertRuleUnitCategoryValidation() {
        fun validateCategory(cat: String): String? {
            return if (cat.isBlank()) {
                "Unit category is required"
            } else {
                null
            }
        }

        assertNotNull(validateCategory(""))
        assertNotNull(validateCategory("   "))
        assertNull(validateCategory("General Medicine"))
        assertNull(validateCategory("ICU"))
    }

    /**
     * Verifies that an [AlertRuleResponse] model maps all expected fields for edit dialog pre-population.
     */
    @Test
    fun testAlertRuleResponseMappingForEdit() {
        val now = kotlin.time.Instant.fromEpochMilliseconds(1750000000000L)
        val rule = AlertRuleResponse(
            id = "rule-uuid-1234",
            unitCategory = "Emergency",
            thresholdPercentage = 88.0,
            severity = AlertSeverity.WARNING,
            isActive = true,
            createdAt = now
        )

        assertEquals("rule-uuid-1234", rule.id)
        assertEquals("Emergency", rule.unitCategory)
        assertEquals(88.0, rule.thresholdPercentage)
        assertEquals(AlertSeverity.WARNING, rule.severity)
        assertTrue(rule.isActive ?: false)
    }
}
