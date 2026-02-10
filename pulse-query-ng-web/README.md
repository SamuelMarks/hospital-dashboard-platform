# PulseQueryNgWeb

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.5.

## 🔗 API Client Generation

This project uses **Contract-First Development**. The frontend code for communicating with the API is auto-generated from the Backend OpenAPI spec.

**Do not edit files in `src/app/api-client` manually.**

To update the client (after backend changes):
1. Navigate to the project root (`pulse-query`).
2. Run the generation script:
   ```bash
   ./generate_client.sh
   ```

This script will:
1. Extract the `openapi.json` from the running FastAPI backend code.
2. Clean the old `api-client` folder.
3. specific TypeScript interfaces and Services.

## Query Cart (Ad-hoc to Dashboard)

Use the Query Cart to stage ad-hoc SQL and drop it into dashboards:

1. Open **Ask Data** from the toolbar.
2. Build/run a query and click **Save to Cart**.
3. Open a dashboard and toggle **Edit** mode.
4. Drag a cart item from the right sidebar onto the dashboard grid (or click **Add**).

Cart items persist in browser storage so you can batch multiple queries before placing them.

## Development server

To start a local development server, run:

```bash
ng serve
```

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Coverage

- Unit coverage is enforced at 100% for TypeScript sources.
- The generated API client (`src/app/api-client`) is excluded from coverage because it is auto-generated.
- Template coverage is enforced by `src/template-coverage.spec.ts`, which verifies every `templateUrl` has a matching spec file and no orphaned templates exist.

## Documentation

Generate documentation:

```bash
npm run docs
```

Enforce 100% documentation coverage for all non-generated app code:

```bash
npm run docs:coverage
```
