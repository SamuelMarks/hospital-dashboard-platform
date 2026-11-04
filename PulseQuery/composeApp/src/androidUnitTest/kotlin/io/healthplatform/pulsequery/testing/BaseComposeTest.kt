/**
 * Android Robolectric actual implementation of [BaseComposeTest] for Compose UI tests.
 */
package io.healthplatform.pulsequery.testing

import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Base class configuring Robolectric SDK 33 runner for Android Compose unit tests.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
actual abstract class BaseComposeTest
