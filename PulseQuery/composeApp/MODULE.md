# Module composeApp

PulseQuery Compose Multiplatform clinical operations dashboard, Text-to-SQL conversational arena, and LLM + JAX + MPAX Hospital Operations Optimization client targeting Android, iOS, Desktop JVM, JavaScript, and WebAssembly.

# Package io.healthplatform.pulsequery

Root application entry points, multiplatform `Platform` expect/actual abstractions, and top-level Compose navigation graph (`App`).

# Package io.healthplatform.pulsequery.api.apis

Strongly typed OpenAPI REST service clients communicating with the PulseQuery FastAPI backend (`/api/v1/*`), including `OptimizationApi` and `BenchmarksApi`.

# Package io.healthplatform.pulsequery.api.auth

HTTP authentication strategies (`OAuth`, `HttpBearerAuth`, `HttpBasicAuth`, `ApiKeyAuth`) implementing the `Authentication` contract.

# Package io.healthplatform.pulsequery.api.infrastructure

Core Ktor HTTP client infrastructure (`ApiClient`, `HttpResponse`, `RequestConfig`, `RequestMethod`, `OctetByteArray`, and multi-value query formatting helpers).

# Package io.healthplatform.pulsequery.api.models

Serializable data transfer objects (DTOs) and polymorphic request/response models for the PulseQuery REST API.

# Package io.healthplatform.pulsequery.core.error

Unified sealed `PulseQueryError` domain error hierarchy encapsulating network, HTTP, authentication, storage, command, and general failures.

# Package io.healthplatform.pulsequery.core.model

Strongly typed domain value classes (`DashboardId`, `WidgetId`, `ConversationId`, `MessageId`, `CandidateId`, `UserId`, `AlertRuleId`, `ColumnName`, `OptimizationSessionId`, `InstitutionId`, `QuickActionId`, `SurveyScore`), clinical enumerations (`OptimizationUseCaseType`, `SolverOutcomeStatus`), and `SqlCellValue` / `ChartDataPoint` models.

# Package io.healthplatform.pulsequery.core.result

Functional `Result<T>` extensions (`asResult`, `runCatchingPulse`, `runCatchingPulseAsync`, `flatMap`, `zip`, `zip3`, `messageOrDefault`) for exception-free error propagation.

# Package io.healthplatform.pulsequery.core.undo

Reversible `UndoableCommand` contract and `UndoRedoManager` stack state machine for dashboard layout operations.

# Package io.healthplatform.pulsequery.database

SQLDelight persistence abstractions (`DatabaseDriverFactory`, `KeyValueStorage`, `WidgetCacheStorage`) with in-memory fallback for browser targets.

# Package io.healthplatform.pulsequery.di

Immutable `ApiServiceRegistry` and `AppContainer` dependency injection container managing session state and service lifecycles.

# Package io.healthplatform.pulsequery.ml

`LiteRtModelManager`, `LiteRtModelDescriptor`, and `LiteRtRuntimeState` providing SHA-256 verification and live hot-loading of quantized On-Device ML (ODML) LiteRT models across Android and Chrome/WebAssembly.

# Package io.healthplatform.pulsequery.network

Ktor `HttpClient` factory, real-time Server-Sent Events (`ChatStreamingRepository`), WebSocket presence (`DashboardWebSocketRepository`), `NetworkHealthRepository`, and `QueryCartRepository`.

# Package io.healthplatform.pulsequery.ui.components

Reusable Material 3 clinical UI components including `FilterRibbon` and `SystemErrorComponents`.

# Package io.healthplatform.pulsequery.ui.components.cart

Interactive `QueryCartBottomSheet` for reviewing and batch-pinning staged SQL queries to dashboards.

# Package io.healthplatform.pulsequery.ui.components.charts

Canvas and Material 3 data visualization components (`BarChart`, `LineChart`, `PieChart`, `HeatmapChart`, `MetricCard`, `TableView`, `TextMarkdownWidget`).

# Package io.healthplatform.pulsequery.ui.screens

Top-level Compose Multiplatform screen composables (`DashboardScreen`, `ChatScreen`, `OptimizationScreen`, `EditorScreen`, `AnalyticsScreen`, `AdminScreen`, `AlertRulesScreen`, `BenchmarksScreen`, `LoginScreen`, `RegisterScreen`).

# Package io.healthplatform.pulsequery.ui.screens.admin

Administrative ViewModels (`AdminViewModel`, `UserManagementViewModel`) and `UserManagementScreen` for LLM provider and clinical role governance.

# Package io.healthplatform.pulsequery.ui.screens.alertrules

`AlertRulesViewModel` managing hospital occupancy threshold alerting rules.

# Package io.healthplatform.pulsequery.ui.screens.analytics

`AnalyticsViewModel` orchestrating LLM output telemetry and performance analytics.

# Package io.healthplatform.pulsequery.ui.screens.auth

`AuthViewModel` orchestrating user login, account registration, validation, and server URL settings.

# Package io.healthplatform.pulsequery.ui.screens.benchmarks

`BenchmarksViewModel` orchestrating gold-standard Text-to-SQL and Hospital Operations Optimization benchmark retrieval.

# Package io.healthplatform.pulsequery.ui.screens.chat

`ChatViewModel` managing multi-turn conversation history, SSE token streaming, candidate model voting, and query cart staging.

# Package io.healthplatform.pulsequery.ui.screens.dashboard

`DashboardViewModel`, `DashboardExportHelper`, `DashboardShareDialog`, and `EditWidgetDialog` orchestrating multi-modal dashboard widgets and offline caching.

# Package io.healthplatform.pulsequery.ui.screens.editor

`EditorViewModel` and `SaveQueryDialog` for ad-hoc SQL query execution and widget/template persistence.

# Package io.healthplatform.pulsequery.ui.screens.optimization

`OptimizationViewModel` and `OptimizationUiState` orchestrating iterative natural-language hospital optimization across Service-Unit Assignments, Surgical Scheduling (BEDS/POINTS), and Physician & Nurse Staffing, Quick Actions, LiteRT model hot-loading, and qualitative UX surveys.

# Package io.healthplatform.pulsequery.ui.screens.tv

`TvDashboardScreen` and `TvDashboardViewModel` providing 10-foot wallboard layouts and D-pad focus navigation.

# Package io.healthplatform.pulsequery.ui.screens.wear

`WearCensusScreen` and `WearCensusViewModel` providing compact smartwatch hospital capacity alert tiles.

# Package io.healthplatform.pulsequery.ui.screens.wizard

`WizardScreen`, `WizardViewModel`, and `WizardState` guiding clinicians through template and custom widget creation.

# Package io.healthplatform.pulsequery.ui.theme

Material 3 `PulseQueryTheme` light and dark color schemes.
