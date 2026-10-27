/**
 * Verification tests enforcing Compose Multiplatform i18n resource bundle synchronization
 * (`values/strings.xml`, `values-es/strings.xml`, `values-fr/strings.xml`) and file-level KDoc coverage.
 */
package io.healthplatform.pulsequery.ui

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Verifies i18n resource parity across locales and KDoc header presence across source files.
 */
class ComposeI18nAndKDocVerificationTest {

    private fun extractStringKeys(xmlFile: File): Set<String> {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(xmlFile)
        val strings = doc.getElementsByTagName("string")
        val plurals = doc.getElementsByTagName("plurals")
        val keys = mutableSetOf<String>()
        for (i in 0 until strings.length) {
            keys.add("string:" + strings.item(i).attributes.getNamedItem("name").nodeValue)
        }
        for (i in 0 until plurals.length) {
            keys.add("plurals:" + plurals.item(i).attributes.getNamedItem("name").nodeValue)
        }
        return keys
    }

    @Test
    fun testLocaleStringBundlesHaveCompleteKeyParity() {
        val resourcesDir = File("src/commonMain/composeResources")
        val enFile = File(resourcesDir, "values/strings.xml")
        val esFile = File(resourcesDir, "values-es/strings.xml")
        val frFile = File(resourcesDir, "values-fr/strings.xml")

        assertTrue(enFile.exists(), "Default English strings.xml must exist")
        assertTrue(esFile.exists(), "Spanish values-es/strings.xml must exist")
        assertTrue(frFile.exists(), "French values-fr/strings.xml must exist")

        val enKeys = extractStringKeys(enFile)
        val esKeys = extractStringKeys(esFile)
        assertEquals(enKeys, esKeys, "Spanish strings.xml keys must match default strings.xml keys")

        val frKeys = extractStringKeys(frFile)
        assertEquals(enKeys, frKeys, "French strings.xml keys must match default strings.xml keys")
    }

    @Test
    fun testAllKotlinSourceFilesContainKDocComments() {
        val srcRoot = File("src/commonMain/kotlin/io/healthplatform/pulsequery")
        assertTrue(srcRoot.exists(), "commonMain source root must exist")

        val missingKDoc = srcRoot.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { file ->
                val content = file.readText()
                !content.contains("/**")
            }
            .map { it.relativeTo(srcRoot).path }
            .toList()

        assertTrue(
            missingKDoc.isEmpty(),
            "All Kotlin source files must contain KDoc documentation comments, missing in: $missingKDoc"
        )
    }
}
