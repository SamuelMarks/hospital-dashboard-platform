import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.ExperimentalWasmDsl
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.composeHotReload)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.sqldelight)
    alias(libs.plugins.kover)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.dokka)
}

kotlin {
    compilerOptions {
        allWarningsAsErrors.set(true)
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }

    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_11)
            allWarningsAsErrors.set(true)
        }
    }

    listOf(
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach { iosTarget ->
        iosTarget.compilerOptions {
            allWarningsAsErrors.set(true)
        }
        iosTarget.binaries.framework {
            baseName = "ComposeApp"
            isStatic = true
            export(libs.sqldelight.native)
            linkerOpts("-lsqlite3")
        }
    }

    jvm {
        compilerOptions {
            allWarningsAsErrors.set(true)
        }
    }

    js {
        compilerOptions {
            allWarningsAsErrors.set(true)
        }
        browser()
        binaries.executable()
    }

    @OptIn(ExperimentalWasmDsl::class)
    wasmJs {
        compilerOptions {
            allWarningsAsErrors.set(true)
        }
        browser()
        binaries.executable()
    }

    sourceSets {
        androidMain.dependencies {
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.ktor.client.android)

            // Android Database
            implementation(libs.sqldelight.android)
            implementation(libs.sqlcipher)
        }
        val androidUnitTest by getting {
            dependencies {
                implementation(libs.robolectric)
            }
        }
        commonMain.dependencies {
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.material3)
            implementation(libs.compose.ui)
            implementation(libs.compose.components.resources)
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.lifecycle.viewmodelCompose)
            implementation(libs.androidx.lifecycle.runtimeCompose)

            // Navigation
            implementation(libs.navigation.compose)

            // Ktor Networking
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.client.websockets)
            implementation(libs.ktor.serialization.kotlinx.json)
            implementation(libs.ktor.client.logging)

            // Kotlinx
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)

            // Okio File System
            implementation(libs.okio)

            // SQLDelight Common
            implementation(libs.sqldelight.coroutines)
            implementation(libs.compose.material.icons.extended)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            @OptIn(org.jetbrains.compose.ExperimentalComposeLibrary::class)
            implementation(compose.uiTest)
            implementation(libs.ktor.client.mock)
        }
        jvmMain.dependencies {
            implementation(compose.desktop.currentOs)
            implementation(libs.kotlinx.coroutinesSwing)
            implementation(libs.ktor.client.java)

            // Desktop Database
            implementation(libs.sqldelight.sqlite)
        }
        jvmTest.dependencies {
            implementation(libs.sqldelight.sqlite)
        }
        jsMain.dependencies {
            implementation(libs.ktor.client.js)
            implementation(libs.sqldelight.webworker)
        }
        wasmJsMain.dependencies {
            implementation(libs.ktor.client.core)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)

            // iOS Database
            api(libs.sqldelight.native)
        }
    }
}

android {
    namespace = "io.healthplatform.pulsequery"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "io.healthplatform.pulsequery"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    debugImplementation(libs.compose.uiTooling)
}

compose.desktop {
    application {
        mainClass = "io.healthplatform.pulsequery.MainKt"

        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "io.healthplatform.pulsequery"
            packageVersion = "1.0.0"
        }
    }
}

sqldelight {
    databases {
        create("PulseQueryDatabase") {
            packageName.set("io.healthplatform.pulsequery.database")
            verifyMigrations.set(true)
        }
    }
}

detekt {
    buildUponDefaultConfig = true
    allRules = false
    config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
    source.setFrom(
        "src/commonMain/kotlin",
        "src/androidMain/kotlin",
        "src/jvmMain/kotlin",
        "src/iosMain/kotlin",
        "src/jsMain/kotlin",
        "src/wasmJsMain/kotlin",
        "src/webMain/kotlin",
    )
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
    exclude("**/generated/**")
    exclude("**/build/**")
}

ktlint {
    filter {
        exclude { element ->
            val path = element.file.path
            path.contains("/build/") || path.contains("/generated/")
        }
    }
}

kover {
    reports {
        filters {
            excludes {
                annotatedBy(
                    "androidx.compose.runtime.Composable",
                    "kotlinx.serialization.Serializable",
                )
                classes(
                    "*.generated.resources.*",
                    "pulsequery.composeapp.generated.resources.*",
                    "io.healthplatform.pulsequery.api.apis.**",
                    "io.healthplatform.pulsequery.api.models.**",
                    "io.healthplatform.pulsequery.database.PulseQueryDatabaseImpl*",
                    "io.healthplatform.pulsequery.database.AppDatabaseQueries*",
                    "io.healthplatform.pulsequery.database.AppConfig*",
                    "io.healthplatform.pulsequery.database.CachedWidget*",
                    "io.healthplatform.pulsequery.database.PulseQueryDatabase*",
                    "io.healthplatform.pulsequery.database.composeApp.*",
                    "io.healthplatform.pulsequery.database.*DriverFactory*",
                    "io.healthplatform.pulsequery.ComposableSingletons\$*",
                    "*ComposableSingletons*",
                    "*\$serializer",
                    "io.healthplatform.pulsequery.MainKt*",
                    "io.healthplatform.pulsequery.MainActivity*",
                    "io.healthplatform.pulsequery.Platform_*",
                    "io.healthplatform.pulsequery.AndroidPlatform*",
                    "io.healthplatform.pulsequery.JVMPlatform*",
                    "io.healthplatform.pulsequery.ui.components.**",
                    "io.healthplatform.pulsequery.ui.screens.*ScreenKt*",
                    "io.healthplatform.pulsequery.ui.screens.**.*ScreenKt*",
                    "io.healthplatform.pulsequery.ui.screens.**.*DialogKt*",
                )
            }
        }
        verify {
            rule {
                bound {
                    minValue = 100
                    coverageUnits = kotlinx.kover.gradle.plugin.dsl.CoverageUnit.LINE
                }
                bound {
                    minValue = 100
                    coverageUnits = kotlinx.kover.gradle.plugin.dsl.CoverageUnit.INSTRUCTION
                }
                bound {
                    minValue = 100
                    coverageUnits = kotlinx.kover.gradle.plugin.dsl.CoverageUnit.BRANCH
                }
            }
        }
    }
}

tasks.withType<AbstractTestTask>().configureEach {
    reports.html.required.set(false)
    reports.junitXml.required.set(true)
}
