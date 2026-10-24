@echo off
:: ## Overview
:: Cross-platform build, database provisioning, dependency installation, stack orchestration,
:: and test runner for Windows (supporting both Docker and Native non-Docker workflows).
::
:: ## Usage
:: make.bat [help|setup|setup_native|run_native|test_native|clean_native|setup_docker|build_docker|run_docker|test_docker|clean_docker|db_docker|migrate_docker|seed_docker|setup_db_docker|backend_docker|frontend_docker|install_base|install_deps|install_db|init_db|migrate_db|seed_db|setup_db|setup_backend|build_backend|dev_backend|setup_frontend|generate_client|build_frontend|dev_frontend|build_docs|build|serve|start_stack|stop_stack|status_stack|health_stack|logs_stack|train_ml|infer_ml|test|fmt]

setlocal EnableDelayedExpansion
set "THIS_FILE=%~f0"

if "%DOCS_DIR%"=="" set DOCS_DIR=docs
if "%COMPOSE_FILE%"=="" set COMPOSE_FILE=docker-compose.yml
if "%LIBSCRIPT_ROOT_DIR%"=="" set "LIBSCRIPT_ROOT_DIR=%USERPROFILE%epos\libscript"
if "%LIBSCRIPT_CLI%"=="" set "LIBSCRIPT_CLI=%LIBSCRIPT_ROOT_DIR%\libscript.cmd"
if "%POSTGRES_USER%"=="" set POSTGRES_USER=postgres
if "%POSTGRES_PASSWORD%"=="" set POSTGRES_PASSWORD=postgres
if "%POSTGRES_DB%"=="" set POSTGRES_DB=pulse_query_db
if "%POSTGRES_HOST%"=="" set POSTGRES_HOST=localhost
if "%POSTGRES_PORT%"=="" set POSTGRES_PORT=5432

if "%~1"=="" goto help
if "%~1"=="help" goto help
if "%~1"=="setup" goto setup
if "%~1"=="setup_native" goto setup_native
if "%~1"=="run_native" goto run_native
if "%~1"=="test_native" goto test_native
if "%~1"=="clean_native" goto clean_native
if "%~1"=="setup_docker" goto setup_docker
if "%~1"=="build_docker" goto build_docker
if "%~1"=="run_docker" goto run_docker
if "%~1"=="test_docker" goto test_docker
if "%~1"=="clean_docker" goto clean_docker
if "%~1"=="db_docker" goto db_docker
if "%~1"=="migrate_docker" goto migrate_docker
if "%~1"=="seed_docker" goto seed_docker
if "%~1"=="setup_db_docker" goto setup_db_docker
if "%~1"=="backend_docker" goto backend_docker
if "%~1"=="frontend_docker" goto frontend_docker
if "%~1"=="install_base" goto install_base
if "%~1"=="install_deps" goto install_deps
if "%~1"=="install_db" goto install_db
if "%~1"=="init_db" goto init_db
if "%~1"=="migrate_db" goto migrate_db
if "%~1"=="seed_db" goto seed_db
if "%~1"=="setup_db" goto setup_db
if "%~1"=="setup_backend" goto setup_backend
if "%~1"=="build_backend" goto build_backend
if "%~1"=="dev_backend" goto dev_backend
if "%~1"=="setup_frontend" goto setup_frontend
if "%~1"=="generate_client" goto generate_client
if "%~1"=="build_frontend" goto build_frontend
if "%~1"=="dev_frontend" goto dev_frontend
if "%~1"=="build_docs" goto build_docs
if "%~1"=="build" goto build
if "%~1"=="serve" goto serve
if "%~1"=="start_stack" goto start_stack
if "%~1"=="stop_stack" goto stop_stack
if "%~1"=="status_stack" goto status_stack
if "%~1"=="health_stack" goto health_stack
if "%~1"=="logs_stack" goto logs_stack
if "%~1"=="train_ml" goto train_ml
if "%~1"=="infer_ml" goto infer_ml
if "%~1"=="test" goto test
if "%~1"=="fmt" goto fmt

echo Unknown target: %~1
goto help

:: ## help
:: Displays available targets and usage instructions.
:help
echo Available commands:
echo.
echo   --- Unified Full-Stack Lifecycle (Native vs Docker) ---
echo   setup          Alias for setup_native (full native setup: base, db, backend, frontend)
echo   setup_native   Install native runtimes, deps, initialize/migrate/seed DB, and build
echo   run_native     Run the full stack natively (LibScript stack or DEBUG static server)
echo   test_native    Run backend and frontend unit tests natively (alias: test)
echo   clean_native   Clean local build and test artifacts
echo   setup_docker   Build Docker images, start DB container, and run migrations + seed
echo   build_docker   Build the docker containers
echo   run_docker     Run the docker containers
echo   test_docker    Run tests in docker containers
echo   clean_docker   Clean up docker containers and volumes
echo.
echo   --- Database Targets (PostgreSQL + DuckDB) ---
echo   install_db     Install native PostgreSQL 18 and DuckDB via LibScript
echo   init_db        Initialize native PostgreSQL user/database (%POSTGRES_DB%)
echo   migrate_db     Run Alembic migrations natively against PostgreSQL
echo   seed_db        Ingest clinical CSVs into DuckDB and seed templates natively
echo   setup_db       Run full native database setup (install_db, init_db, migrate_db, seed_db)
echo   db_docker      Start only the PostgreSQL container via Docker Compose
echo   migrate_docker Run Alembic migrations inside the backend Docker container
echo   seed_docker    Ingest clinical CSVs and seed templates inside the backend Docker container
echo   setup_db_docker Start Docker DB, run migrations, and seed data
echo.
echo   --- Backend Targets (FastAPI) ---
echo   setup_backend  Create Python venv, bootstrap .env, and install backend dependencies
echo   build_backend  Install the backend package in editable mode
echo   dev_backend    Start the local dev server backend with hot reload
echo   backend_docker Build and run the backend (and db) containers via Docker Compose
echo.
echo   --- Frontend Targets (Angular + OpenAPI SDK) ---
echo   setup_frontend Install Node.js frontend dependencies in pulse-query-ng-web
echo   generate_client Generate Angular ^& KMP OpenAPI client SDKs from backend schema
echo   build_frontend Build the Angular frontend production bundle
echo   dev_frontend   Start the Angular dev server (http://localhost:4200)
echo   frontend_docker Build and run the frontend container via Docker Compose
echo.
echo   --- Shared / Orchestration / Quality Targets ---
echo   install_base   Install language runtime and tools (Python, Node.js, uv, Postgres, DuckDB)
echo   install_deps   Install local backend and frontend dependencies
echo   build          Build the frontend and backend
echo   build_docs     Build the API docs and verify 100%% doc coverage (DOCS_DIR=%DOCS_DIR%)
echo   serve          Serve the built frontend behind the backend static file server (DEBUG=1)
echo   start_stack    Start the declarative LibScript stack (libscript.json)
echo   stop_stack     Stop the declarative LibScript stack (libscript.json)
echo   status_stack   Inspect status of the declarative LibScript stack
echo   health_stack   Run health checks on the declarative LibScript stack
echo   logs_stack     Tail logs for the declarative LibScript stack
echo   train_ml       Run declarative ML/MPAX benchmark training via LibScript
echo   infer_ml       Run declarative ML/MPAX arena inference/scoring via LibScript
echo   test           Run tests locally
echo   fmt            Format the frontend and backend code
echo   help           Show help text
goto :eof

:: ## get_docker_compose
:: Resolves the active docker compose command.
:get_docker_compose
where docker-compose >nul 2>&1
if not errorlevel 1 (
    set DOCKER_COMPOSE=docker-compose
    goto :eof
)
set DOCKER_COMPOSE=docker compose
goto :eof

:: ## resolve_python
:: Resolves the active Python executable (python or python3) in Windows environments.
:resolve_python
where python >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=python
    goto :eof
)
set PYTHON_CMD=python3
goto :eof

:: ## activate_venv
:: Activates the local Python virtual environment if present.
:activate_venv
set "VENV_FOUND="
for /d %%d in (.venv venv .venv-* venv-* pulse-query-backend\.venv pulse-query-backend\venv pulse-query-backend\.venv-* pulse-query-backend\venv-*) do (
    if exist "%~dp0%%d\Scripts\activate.bat" (
        call "%~dp0%%d\Scripts\activate.bat"
        set "VENV_FOUND=1"
        goto :eof
    )
)
goto :eof

:: -----------------------------------------------------------------------------
:: Docker Targets
:: -----------------------------------------------------------------------------

:: ## build_docker
:: Builds the Docker Compose containers.
:build_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% build
goto :eof

:: ## db_docker
:: Starts the PostgreSQL database container via Docker Compose.
:db_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% up -d db
goto :eof

:: ## migrate_docker
:: Runs Alembic database migrations inside the backend Docker container.
:migrate_docker
call :db_docker
if errorlevel 1 goto :eof
%DOCKER_COMPOSE% -f %COMPOSE_FILE% run --rm backend alembic upgrade head
goto :eof

:: ## seed_docker
:: Runs DuckDB CSV ingestion and PostgreSQL template seeding inside the backend Docker container.
:seed_docker
call :db_docker
if errorlevel 1 goto :eof
%DOCKER_COMPOSE% -f %COMPOSE_FILE% run --rm backend python scripts/ingest.py
if errorlevel 1 goto :eof
%DOCKER_COMPOSE% -f %COMPOSE_FILE% run --rm backend python scripts/seed_templates.py
goto :eof

:: ## setup_db_docker
:: Starts the Docker database container, runs migrations, and seeds initial datasets.
:setup_db_docker
call :db_docker
if errorlevel 1 goto :eof
call :migrate_docker
if errorlevel 1 goto :eof
call :seed_docker
goto :eof

:: ## backend_docker
:: Builds and starts the database and backend containers via Docker Compose.
:backend_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% up --build -d db backend
goto :eof

:: ## frontend_docker
:: Builds and starts the frontend container via Docker Compose.
:frontend_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% up --build -d frontend
goto :eof

:: ## setup_docker
:: Builds all Docker images and initializes/migrates/seeds the containerized databases.
:setup_docker
call :build_docker
if errorlevel 1 goto :eof
call :setup_db_docker
goto :eof

:: ## run_docker
:: Starts the Docker Compose containers.
:run_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% up
goto :eof

:: ## test_docker
:: Runs backend and frontend tests inside Docker Compose containers.
:test_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% run --rm backend pytest
if errorlevel 1 goto :eof
%DOCKER_COMPOSE% -f %COMPOSE_FILE% run --rm frontend npm run test -- --watch=false
goto :eof

:: ## clean_docker
:: Tears down Docker Compose containers and volumes.
:clean_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% down -v
goto :eof

:: -----------------------------------------------------------------------------
:: Native Base & Dependency Targets
:: -----------------------------------------------------------------------------

:: ## install_base
:: Installs base language runtimes, tools, and databases via LibScript.
:install_base
if exist "%LIBSCRIPT_CLI%" (
    call "%LIBSCRIPT_CLI%" install python 3.12
    call "%LIBSCRIPT_CLI%" install nodejs 22
    call "%LIBSCRIPT_CLI%" install uv latest
    call "%LIBSCRIPT_CLI%" install postgres 18
    call "%LIBSCRIPT_CLI%" install duckdb latest
)
call :activate_venv
call :resolve_python
%PYTHON_CMD% -m pip install --upgrade pip
call npm install -g npm
goto :eof

:: -----------------------------------------------------------------------------
:: Native Database Targets (PostgreSQL + DuckDB)
:: -----------------------------------------------------------------------------

:: ## install_db
:: Installs native PostgreSQL 18 and DuckDB engines via LibScript.
:install_db
if exist "%LIBSCRIPT_CLI%" (
    call "%LIBSCRIPT_CLI%" install postgres 18
    call "%LIBSCRIPT_CLI%" install duckdb latest
)
goto :eof

:: ## init_db
:: Initializes the native PostgreSQL database if psql is available on PATH.
:init_db
where psql >nul 2>&1
if not errorlevel 1 (
    set "PGPASSWORD=%POSTGRES_PASSWORD%"
    psql -h %POSTGRES_HOST% -p %POSTGRES_PORT% -U %POSTGRES_USER% -c "CREATE DATABASE %POSTGRES_DB% OWNER %POSTGRES_USER%;" >nul 2>&1
)
goto :eof

:: ## migrate_db
:: Bootstraps .env if missing and runs Alembic migrations natively.
:migrate_db
if not exist ".env.secrets" (
    if exist ".env.secrets.tpl" (
        copy /Y ".env.secrets.tpl" ".env.secrets" >nul
    )
)
if not exist "pulse-query-backend\.env" (
    if exist "pulse-query-backend\.env.tpl" (
        copy /Y "pulse-query-backend\.env.tpl" "pulse-query-backend\.env" >nul
    )
)
call :activate_venv
cd pulse-query-backend
set "PYTHONPATH=src"
alembic upgrade head
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
goto :eof

:: ## seed_db
:: Ingests clinical CSV datasets into DuckDB and seeds initial dashboard templates into PostgreSQL.
:seed_db
if not exist ".env.secrets" (
    if exist ".env.secrets.tpl" (
        copy /Y ".env.secrets.tpl" ".env.secrets" >nul
    )
)
if not exist "pulse-query-backend\.env" (
    if exist "pulse-query-backend\.env.tpl" (
        copy /Y "pulse-query-backend\.env.tpl" "pulse-query-backend\.env" >nul
    )
)
call :activate_venv
call :resolve_python
cd pulse-query-backend
set "PYTHONPATH=src"
%PYTHON_CMD% scripts/ingest.py
if errorlevel 1 (
    cd ..
    exit /b 1
)
%PYTHON_CMD% scripts/seed_templates.py
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
goto :eof

:: ## setup_db
:: Runs the complete native database setup lifecycle (install_db, init_db, migrate_db, seed_db).
:setup_db
call :install_db
if errorlevel 1 goto :eof
call :init_db
if errorlevel 1 goto :eof
call :migrate_db
if errorlevel 1 goto :eof
call :seed_db
goto :eof

:: -----------------------------------------------------------------------------
:: Native Backend Targets (FastAPI)
:: -----------------------------------------------------------------------------

:: ## setup_backend
:: Creates a Python virtual environment if missing, initializes .env, and installs backend packages.
:setup_backend
call :activate_venv
call :resolve_python
if "%VENV_FOUND%"=="" (
    where uv >nul 2>&1
    if not errorlevel 1 (
        call uv venv --python 3.12 pulse-query-backend\.venv
    ) else (
        %PYTHON_CMD% -m venv pulse-query-backend\.venv
    )
    call :activate_venv
    call :resolve_python
)
if not exist ".env.secrets" (
    if exist ".env.secrets.tpl" (
        copy /Y ".env.secrets.tpl" ".env.secrets" >nul
    )
)
if not exist "pulse-query-backend\.env" (
    if exist "pulse-query-backend\.env.tpl" (
        copy /Y "pulse-query-backend\.env.tpl" "pulse-query-backend\.env" >nul
    )
)
cd pulse-query-backend
%PYTHON_CMD% -m pip install -r requirements.txt -r requirements-dev.txt
if errorlevel 1 (
    cd ..
    exit /b 1
)
%PYTHON_CMD% -m pip install -e .
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
goto :eof

:: ## build_backend
:: Installs the Python backend package in editable mode.
:build_backend
call :activate_venv
call :resolve_python
cd pulse-query-backend
%PYTHON_CMD% -m pip install -e .
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
goto :eof

:: ## dev_backend
:: Starts the local FastAPI backend server with hot reload.
:dev_backend
call :activate_venv
cd pulse-query-backend
set "PYTHONPATH=src"
uvicorn --app-dir src app.main:app --reload --port 8000
cd ..
goto :eof

:: -----------------------------------------------------------------------------
:: Native Frontend Targets (Angular + OpenAPI SDK)
:: -----------------------------------------------------------------------------

:: ## setup_frontend
:: Installs Node.js frontend dependencies in pulse-query-ng-web.
:setup_frontend
cd pulse-query-ng-web
call npm install --legacy-peer-deps
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
goto :eof

:: ## generate_client
:: Generates the Angular TypeScript and KMP OpenAPI client SDKs from the backend OpenAPI schema.
:generate_client
where bash >nul 2>&1
if not errorlevel 1 (
    bash ./generate_client.sh
    goto :eof
)
call :activate_venv
call :resolve_python
cd pulse-query-backend
%PYTHON_CMD% scripts/extract_openapi.py --output ../openapi.json
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
call npx -y @openapitools/openapi-generator-cli generate -i openapi.json -g typescript-angular -o ./pulse-query-ng-web/src/app/api-client --additional-properties=ngVersion=17.0.0,fileNaming=kebab-case --skip-validate-spec
del /Q openapi.json 2>nul
goto :eof

:: ## build_frontend
:: Builds the Angular frontend production distribution.
:build_frontend
cd pulse-query-ng-web
call npm run build
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
goto :eof

:: ## dev_frontend
:: Starts the local Angular development server with proxy configuration.
:dev_frontend
cd pulse-query-ng-web
call npm start
cd ..
goto :eof

:: -----------------------------------------------------------------------------
:: Composite Native Targets
:: -----------------------------------------------------------------------------

:: ## install_deps
:: Installs Python backend and Node.js frontend dependencies.
:install_deps
call :setup_backend
if errorlevel 1 goto :eof
call :setup_frontend
goto :eof

:: ## build
:: Builds the Angular frontend and installs the Python backend package.
:build
call :build_frontend
if errorlevel 1 goto :eof
call :build_backend
goto :eof

:: ## build_docs
:: Audits backend and frontend docstring coverage and generates documentation.
:build_docs
if not exist "%DOCS_DIR%" mkdir "%DOCS_DIR%"
call :activate_venv
cd pulse-query-backend
interrogate -vv --fail-under=100 src/app
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..\pulse-query-ng-web
call npm run docs:coverage
if errorlevel 1 (
    cd ..
    exit /b 1
)
call npm run docs
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
echo Docs built in %DOCS_DIR%
goto :eof

:: ## serve
:: Starts the local FastAPI backend server in DEBUG mode serving static frontend assets.
:serve
if not exist "pulse-query-ng-web\dist" (
    call :build_frontend
    if errorlevel 1 goto :eof
)
call :activate_venv
cd pulse-query-backend
set "DEBUG=1"
set "PYTHONPATH=src"
uvicorn --app-dir src app.main:app --reload --port 8000
cd ..
goto :eof

:: ## setup_native
:: Executes full native provisioning across runtimes, backend, frontend, and databases.
:setup_native
call :install_base
if errorlevel 1 goto :eof
call :install_deps
if errorlevel 1 goto :eof
call :setup_db
if errorlevel 1 goto :eof
call :build
goto :eof

:: ## setup
:: Alias for setup_native.
:setup
call :setup_native
goto :eof

:: ## run_native
:: Runs the full application stack natively via LibScript or FastAPI static serving.
:run_native
if exist "%LIBSCRIPT_CLI%" (
    call "%LIBSCRIPT_CLI%" start libscript.json
    goto :eof
)
call :serve
goto :eof

:: ## start_stack
:: Starts the declarative LibScript stack.
:start_stack
call "%LIBSCRIPT_CLI%" start libscript.json
goto :eof

:: ## stop_stack
:: Stops the declarative LibScript stack.
:stop_stack
call "%LIBSCRIPT_CLI%" stop libscript.json
goto :eof

:: ## status_stack
:: Inspects status of the declarative LibScript stack.
:status_stack
call "%LIBSCRIPT_CLI%" status libscript.json
goto :eof

:: ## health_stack
:: Runs health checks on the declarative LibScript stack.
:health_stack
call "%LIBSCRIPT_CLI%" health libscript.json
goto :eof

:: ## logs_stack
:: Outputs logs for the declarative LibScript stack.
:logs_stack
call "%LIBSCRIPT_CLI%" logs libscript.json
goto :eof

:: ## train_ml
:: Runs declarative ML/MPAX benchmark training via LibScript.
:train_ml
call "%LIBSCRIPT_CLI%" train libscript.json
goto :eof

:: ## infer_ml
:: Runs declarative ML/MPAX arena inference/scoring via LibScript.
:infer_ml
call "%LIBSCRIPT_CLI%" infer libscript.json
goto :eof

:: ## test
:: Runs the local backend pytest suite and Angular frontend unit tests.
:test
call :activate_venv
cd pulse-query-backend
pytest
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..\pulse-query-ng-web
call npm run test -- --watch=false
if errorlevel 1 (
    cd ..
    exit /b 1
)
cd ..
goto :eof

:: ## test_native
:: Alias for test.
:test_native
call :test
goto :eof

:: ## clean_native
:: Removes local frontend/backend build and test artifacts.
:clean_native
if exist "pulse-query-ng-web\dist" rmdir /S /Q "pulse-query-ng-web\dist"
if exist "pulse-query-ng-web\.angular" rmdir /S /Q "pulse-query-ng-web\.angular"
if exist "pulse-query-backend\.pytest_cache" rmdir /S /Q "pulse-query-backend\.pytest_cache"
if exist "pulse-query-backend\.coverage" del /F /Q "pulse-query-backend\.coverage"
if exist "%DOCS_DIR%" rmdir /S /Q "%DOCS_DIR%"
goto :eof

:: ## fmt
:: Formats Python backend and Angular frontend code.
:fmt
call :activate_venv
ruff format .
if errorlevel 1 goto :eof
cd pulse-query-ng-web
call npm run format
cd ..
goto :eof
