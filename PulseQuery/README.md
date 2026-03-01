# PulseQuery Kotlin Multiplatform App

This is a comprehensive Native UI implementation for the PulseQuery platform. Built using **JetBrains Compose Multiplatform**, it delivers a unified user experience across Android, iOS, Desktop (JVM), and Web via Kotlin/Wasm while enforcing 100% test and documentation coverage locally.

## Features & Architecture

This application maintains parity with the core capabilities defined in the broader platform while strictly adhering to a fully typed Kotlin cross-platform toolchain:

*   **Architecture Pattern**: MVI / MVVM driven through Native Compose State Flows.
*   **Routing**: Official **Jetpack Navigation Compose** (`navigation-compose`), enforcing typed and stack-managed transitions.
*   **Networking**: Configured via **Ktor Client** and `kotlinx.serialization` parsing OpenAPI-generated typed endpoints (`AuthApi`, `ChatApi`, `SimulationApi`, etc.).
*   **Cache / Offline**: Integrated **SQLDelight** (`AppDatabase.sq`) utilizing platform-specific SQLite drivers (Android/iOS/JVM) for secure session and settings tracking.
*   **User Interface**: Implemented with **Material Design 3**, dynamically responding to system themes, alongside custom `Canvas`-drawn metric charts (`BarChart`, `LineChart`) to guarantee rendering across experimental environments like Wasm.

## Setup & Running

This project requires **Java 17+** (JDK 21 recommended) and a connected device, emulator, or running backend server.

### Android
```bash
./gradlew :composeApp:assembleDebug
# Or run directly via Android Studio / IntelliJ IDEA
```

### Desktop (JVM)
```bash
./gradlew :composeApp:run
```

### iOS
Open `iosApp/iosApp.xcodeproj` in Xcode to run on a simulator/device. Ensure CocoaPods/Framework bindings are linked via:
```bash
./gradlew :composeApp:embedAndSignAppleFrameworkForXcode
```

## Testing & Quality Assurance

This codebase enforces strict **100% KDoc Documentation** and **100% Functional Test Coverage**.
To execute the tests natively or within CI/CD pipelines, run:

```bash
# Execute common logic and Android mapping tests
./gradlew :composeApp:testDebugUnitTest

# Execute local SQL database (JVM In-Memory) behavior tests
./gradlew :composeApp:jvmTest
```
