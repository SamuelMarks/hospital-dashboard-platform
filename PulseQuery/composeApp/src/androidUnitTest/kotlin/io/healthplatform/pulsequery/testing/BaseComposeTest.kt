package io.healthplatform.pulsequery.testing

import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33]) // sometimes helpful to specify SDK to avoid missing API issues
actual abstract class BaseComposeTest
