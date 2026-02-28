# Architecture

> **Purpose:** This document details the technical design, system overview, component diagrams, and interactions that define the Pulse Query platform. It serves as the primary technical reference for understanding the split-stack architecture and data flow.

**Pulse Query** is an enterprise-grade hospital analytics platform designed to bridge the gap between operational data (EHR logs) and strategic decision-making (Capacity Planning). It employs a **Split-Stack Architecture** optimized for strict typing, rapid analytical queries, and complex optimization modeling.

---

## 1. System Overview

The platform uses a decoupled interaction model where the Frontend communicates exclusively via a REST API. The Backend acts as an orchestration layer, routing requests to either a transactional metadata store (PostgreSQL), an analytical engine (DuckDB), or a mathematical solver (MPAX).

### High-Level Components

```mermaid
flowchart TD
    %% Node Definitions
    User([End User])

    subgraph Client ["Frontend (Angular)"]
        UI["UI Layer<br>(Signals & Material)"]
        SDK["Generated SDK<br>(OpenAPI)"]
    end

    subgraph Server ["Backend (FastAPI)"]
        API["API Gateway"]
        Orchestrator["Execution Orchestrator"]
        SimEngine["Simulation Service"]
    end

    subgraph Data ["Persistence Layer"]
        PG[("PostgreSQL<br>(Metadata)")]
        Duck[("DuckDB<br>(OLAP Analytics)")]
        MPAX["MPAX Solver<br>(Optimization)"]
    end

    %% Relationships
    User --> UI
    UI --> SDK
    SDK -- "JSON / HTTPS" --> API
    API --> PG
    API --> Orchestrator

    Orchestrator --> Duck
    Orchestrator -- "External APIs" --> HTTP_WIDGETS[External Endpoints]

    API --> SimEngine
    SimEngine -- "Demand Data" --> Duck
    SimEngine -- "JAX / Numpy" --> MPAX

    %% ---------------------------------------------------------
    %% Design Constraints & Styling
    %% ---------------------------------------------------------

    %% Fonts
    %% Headlines: Google Sans Medium
    %% Subheads: Roboto Mono Normal
    %% Body: Google Sans Normal

    classDef default font-family:'Google Sans Normal',sans-serif,fill:#ffffff,stroke:#20344b,stroke-width:2px,color:#20344b;

    %% Colors
    classDef blue fill:#4285f4,color:#ffffff,stroke:#20344b;
    classDef green fill:#34a853,color:#ffffff,stroke:#20344b;
    classDef navy fill:#20344b,color:#ffffff,stroke:#57caff;
    classDef yellow fill:#f9ab00,color:#ffffff,stroke:#20344b;
    classDef red fill:#ea4335,color:#ffffff,stroke:#20344b;

    %% Application
    class UI,SDK blue;
    class API,Orchestrator green;
    class PG,Duck navy;
    class SimEngine,MPAX red;
    class User yellow;

    %% Subgraph Styling
    style Client fill:#ffffff,stroke:#4285f4,stroke-width:2px,stroke-dasharray: 5 5,font-family:'Google Sans Medium',font-size:16px,color:#20344b
    style Server fill:#ffffff,stroke:#34a853,stroke-width:2px,stroke-dasharray: 5 5,font-family:'Google Sans Medium',font-size:16px,color:#20344b
    style Data fill:#ffffff,stroke:#20344b,stroke-width:2px,stroke-dasharray: 5 5,font-family:'Google Sans Medium',font-size:16px,color:#20344b

    %% Edge Styling (Roboto Mono)
    linkStyle 0,1,2,3,4,5,6,7,8,9 stroke:#20344b,stroke-width:1px,fill:none,font-family:'Roboto Mono Normal',font-size:11px;
```

---

## 2. Backend Architecture (`/backend`)

The backend is built on **FastAPI** using Python 3.12+. It is designed around the **Service Repository Pattern** but specifically adapted for Analytics use cases.

### Core Modules

1.  **Dual-Database Strategy:**
    - **PostgreSQL (`app.database.postgres`):** Stores "State". Users, Dashboard configurations, Widget positioning, and Template registry. Accessed via `SQLAlchemy (Async)`.
    - **DuckDB (`app.database.duckdb`):** Stores "Data". Ingested CSVs provided by the hospital. Accessed via native bindings purely for read-only aggregation queries.

2.  **Execution Engine:**
    The `Orchestrator` determines how to fulfill a widget's data request:
    - **SQL Widgets:** Validated via `sqlglot` -> Executed against DuckDB.
    - **HTTP Widgets:** Executed locally via `httpx` (proxy behavior).

3.  **Optimization Bridge (MPAX):**
    The system includes a bridge to **MPAX**, a JAX-based linear programming solver. This allows the backend to perform "What-If" capacity planning by pulling live demand from DuckDB and solving allocation constraints in memory.

### Data Ingestion Pipeline

On startup, `app.services.data_ingestion` scans the `data/` directory. It sanitizes filenames and loads CSVs directly into the DuckDB persistent file (`hospital_analytics.duckdb`), creating indices on commonly filtered columns (e.g., `Clinical_Service`).

---

## 3. Frontend Architecture (`/pulse-query-ng-web`)

The frontend is a modern **Angular 17+** application utilizing **Standalone Components** and **Signals** for state management. It is designed with a **Contract-First** methodology.

### Architecture Highlights

1.  **Strictly Typed Client:**
    The API layer (`src/app/api-client`) is **not** written manually. It is generated via `generate_client.sh` from the Backend's OpenAPI JSON. This ensures that any change in Python schemas immediately flags compilation errors in TypeScript.

2.  **Signal-Based State Management:**
    Instead of heavy libraries like NgRx, the app uses localized `Injectable` stores (`DashboardStore`, `SimulationStore`) leveraging Angular `signal`, `computed`, and `effect`.
    - **Optimistic UI:** Actions like "Move Widget" or "Delete Dashboard" update the UI signal immediately, reverting only if the API call fails.

3.  **Visualization Layer:**
    Widgets are rendered via "Dumb Components" (`viz-table`, `viz-chart`, `viz-heatmap`) that accept raw data and configuration inputs. The logic for transforming API responses into visual structures resides in these components involving computed signals.

### Dashboard Layout Flow

```mermaid
sequenceDiagram
    participant User
    participant Component as DashboardLayout (TS)
    participant Store as DashboardStore
    participant API as ExecutionService
    participant Backend

    User->>Component: Loads Dashboard Route
    Component->>Store: loadDashboard(id)

    rect rgb(240, 248, 255)
        Note over Store: Pipeline Initialization
        Store->>API: getDashboard(id)
        API->>Backend: GET /dashboards/{id}
        Backend-->>Store: { widgets: [SQL, HTTP...] }
        Store->>Store: Update Dashboard Signal
    end

    rect rgb(255, 250, 240)
        Note over Store: Execution Phase
        Store->>API: refresh(id, global_filters)
        API->>Backend: POST /dashboards/{id}/refresh

        Backend->>Backend: Run DucksDB SQL
        Backend->>Backend: Run External HTTP

        Backend-->>Store: { widget_id: { data: [...] } }
        Store->>Store: Update DataMap Signal
    end

    Store-->>Component: Signal Updates
    Component-->>User: Renders Visualizations
```

---

## 4. Key Design Patterns

### A. The "Ghost Grid" (Skeleton Loading)

To prevent layout shift (CLS), the dashboard renders a skeleton structure (`app-skeleton-loader`) matching the grid layout while data is fetching. This is managed by the `isLoading` signal in the `DashboardStore`.

### B. Analytical Security via AST

The SQL Runner (`backend/app/services/runners/sql.py`) does not rely on Regex for security. It parses user queries into an **Abstract Syntax Tree (AST)** using `sqlglot`. It recursively walks the tree to ensure **only** `SELECT` and `CTE` statements are present, rejecting `DROP`, `DELETE`, or hidden modification commands before they touch the database.

### C. The "Marketplace" Seeder

Standard analytical questions are stored as Templates.

1.  **JSON Definition:** `backend/data/initial_templates.json`.
2.  **Seeding:** On startup, `template_seeder.py` upserts these definitions into Postgres.
3.  **Usage:** Users select templates in the frontend wizard; the backend instantiates a Widget copy with specific parameters injected into the SQL via Handlebars syntax (e.g., `{{unit_name}}`).

### D. Simulation Loop

The Simulation feature bypasses the standard widget flow:

1.  Frontend sends parameters (e.g., "Reduce ICU Capacity by 20%").
2.  Backend runs a **Snapshot Query** against DuckDB to get current patient load.
3.  Backend feeds Snapshot + Params into **MPAX/JAX**.
4.  Solver optimizes bed allocation.
5.  Results return to frontend as distinct "Scenario Results".

---

## 5. Deployment Topology

In a production environment, the services communicate over a private Docker network.

```mermaid
flowchart LR
    %% Nodes
    Browser[User Browser]
    NGINX[Nginx Reverse Proxy]
    AppSvc[FastAPI App Service]
    PG[(Postgres Container)]
    Vol[DuckDB Volume]

    %% Edges
    Browser -- "HTTPS" --> NGINX
    NGINX -- "Static Assets" --> Browser
    NGINX -- "/api/*" --> AppSvc
    AppSvc -- "SQLAlchemy" --> PG
    AppSvc -- "File I/O" --> Vol

    %% Styling
    classDef browserNode fill:#f9ab00,stroke:#20344b,color:#ffffff,font-family:'Google Sans Normal';
    classDef proxyNode fill:#4285f4,stroke:#20344b,color:#ffffff,font-family:'Google Sans Normal';
    classDef appNode fill:#34a853,stroke:#20344b,color:#ffffff,font-family:'Google Sans Normal';
    classDef dbNode fill:#20344b,stroke:#20344b,color:#ffffff,font-family:'Google Sans Normal';

    class Browser browserNode;
    class NGINX proxyNode;
    class AppSvc appNode;
    class PG,Vol dbNode;

    linkStyle default font-family:'Roboto Mono Normal',stroke:#20344b,stroke-width:1px;
```
