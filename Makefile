# ==============================================================================
# Hospital Dashboard Platform (Pulse Query) - Makefile
#
# Provides both Docker and Native (non-Docker) targets to set up, build, migrate,
# seed, run, test, and clean the Database (PostgreSQL + DuckDB), Backend
# (FastAPI), and Frontend (Angular + OpenAPI SDK).
# ==============================================================================

.PHONY: help 
	setup setup_native run_native test_native clean_native 
	setup_docker build_docker run_docker test_docker clean_docker 
	db_docker migrate_docker seed_docker setup_db_docker backend_docker frontend_docker 
	install_base install_deps 
	install_db init_db migrate_db seed_db setup_db 
	setup_backend build_backend dev_backend 
	setup_frontend generate_client build_frontend dev_frontend 
	build build_docs serve 
	start_stack stop_stack status_stack health_stack logs_stack train_ml infer_ml 
	test fmt

DOCS_DIR ?= docs
COMPOSE_FILE ?= docker-compose.yml
DOCKER_COMPOSE ?= $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)
LIBSCRIPT_ROOT_DIR ?= $(HOME)/repos/libscript
LIBSCRIPT_CLI ?= $(LIBSCRIPT_ROOT_DIR)/libscript.sh
POSTGRES_USER ?= postgres
POSTGRES_PASSWORD ?= postgres
POSTGRES_DB ?= pulse_query_db
POSTGRES_HOST ?= localhost
POSTGRES_PORT ?= 5432

VENV_ACTIVATE = for d in .venv venv .venv-* venv-* pulse-query-backend/.venv pulse-query-backend/venv pulse-query-backend/.venv-* pulse-query-backend/venv-*; do if [ -f "$(CURDIR)/$$d/bin/activate" ]; then . "$(CURDIR)/$$d/bin/activate"; break; fi; done;

help:
	@echo "Available commands:"
	@echo ""
	@echo "  --- Unified Full-Stack Lifecycle (Native vs Docker) ---"
	@echo "  setup          Alias for setup_native (full native setup: base, db, backend, frontend)"
	@echo "  setup_native   Install native runtimes, deps, initialize/migrate/seed DB, and build"
	@echo "  run_native     Run the full stack natively (LibScript stack or DEBUG static server)"
	@echo "  test_native    Run backend and frontend unit tests natively (alias: test)"
	@echo "  clean_native   Clean local build and test artifacts"
	@echo "  setup_docker   Build Docker images, start DB container, and run migrations + seed"
	@echo "  build_docker   Build the docker containers"
	@echo "  run_docker     Run the docker containers"
	@echo "  test_docker    Run tests in docker containers"
	@echo "  clean_docker   Clean up docker containers and volumes"
	@echo ""
	@echo "  --- Database Targets (PostgreSQL + DuckDB) ---"
	@echo "  install_db     Install native PostgreSQL 18 and DuckDB via LibScript"
	@echo "  init_db        Initialize native PostgreSQL user/database ($(POSTGRES_DB))"
	@echo "  migrate_db     Run Alembic migrations natively against PostgreSQL"
	@echo "  seed_db        Ingest clinical CSVs into DuckDB and seed templates natively"
	@echo "  setup_db       Run full native database setup (install_db, init_db, migrate_db, seed_db)"
	@echo "  db_docker      Start only the PostgreSQL container via Docker Compose"
	@echo "  migrate_docker Run Alembic migrations inside the backend Docker container"
	@echo "  seed_docker    Ingest clinical CSVs and seed templates inside the backend Docker container"
	@echo "  setup_db_docker Start Docker DB, run migrations, and seed data"
	@echo ""
	@echo "  --- Backend Targets (FastAPI) ---"
	@echo "  setup_backend  Create Python venv, bootstrap .env, and install backend dependencies"
	@echo "  build_backend  Install the backend package in editable mode"
	@echo "  dev_backend    Start the local dev server backend with hot reload"
	@echo "  backend_docker Build and run the backend (and db) containers via Docker Compose"
	@echo ""
	@echo "  --- Frontend Targets (Angular + OpenAPI SDK) ---"
	@echo "  setup_frontend Install Node.js frontend dependencies in pulse-query-ng-web"
	@echo "  generate_client Generate Angular & KMP OpenAPI client SDKs from backend schema"
	@echo "  build_frontend Build the Angular frontend production bundle"
	@echo "  dev_frontend   Start the Angular dev server (http://localhost:4200)"
	@echo "  frontend_docker Build and run the frontend container via Docker Compose"
	@echo ""
	@echo "  --- Shared / Orchestration / Quality Targets ---"
	@echo "  install_base   Install language runtime and tools (Python, Node.js, uv, Postgres, DuckDB)"
	@echo "  install_deps   Install local backend and frontend dependencies"
	@echo "  build          Build the frontend and backend"
	@echo "  build_docs     Build the API docs and verify 100% doc coverage (DOCS_DIR=$(DOCS_DIR))"
	@echo "  serve          Serve the built frontend behind the backend static file server (DEBUG=1)"
	@echo "  start_stack    Start the declarative LibScript stack (libscript.json)"
	@echo "  stop_stack     Stop the declarative LibScript stack (libscript.json)"
	@echo "  status_stack   Inspect status of the declarative LibScript stack"
	@echo "  health_stack   Run health checks on the declarative LibScript stack"
	@echo "  logs_stack     Tail logs for the declarative LibScript stack"
	@echo "  train_ml       Run declarative ML/MPAX benchmark training via LibScript"
	@echo "  infer_ml       Run declarative ML/MPAX arena inference/scoring via LibScript"
	@echo "  test           Run tests locally"
	@echo "  fmt            Format the frontend and backend code"
	@echo "  help           Show help text"

# ------------------------------------------------------------------------------
# Docker Targets
# ------------------------------------------------------------------------------

build_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) build

db_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up -d db

migrate_docker: db_docker
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) run --rm backend alembic upgrade head

seed_docker: db_docker
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) run --rm backend python scripts/ingest.py
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) run --rm backend python scripts/seed_templates.py

setup_db_docker: db_docker migrate_docker seed_docker

backend_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up --build -d db backend

frontend_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up --build -d frontend

setup_docker: build_docker setup_db_docker

run_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up

test_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) run --rm backend pytest
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) run --rm frontend npm run test -- --watch=false

clean_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down -v

# ------------------------------------------------------------------------------
# Native Base & Dependency Targets
# ------------------------------------------------------------------------------

install_base:
	@if [ -f "$(LIBSCRIPT_CLI)" ]; then 
		"$(LIBSCRIPT_CLI)" install python 3.12; 
		"$(LIBSCRIPT_CLI)" install nodejs 22; 
		"$(LIBSCRIPT_CLI)" install uv latest; 
		"$(LIBSCRIPT_CLI)" install postgres 18; 
		"$(LIBSCRIPT_CLI)" install duckdb latest; 
	fi
	$(VENV_ACTIVATE) python3 -m pip install --upgrade pip
	npm install -g npm

# ------------------------------------------------------------------------------
# Native Database Targets (PostgreSQL + DuckDB)
# ------------------------------------------------------------------------------

install_db:
	@if [ -f "$(LIBSCRIPT_CLI)" ]; then 
		"$(LIBSCRIPT_CLI)" install postgres 18; 
		"$(LIBSCRIPT_CLI)" install duckdb latest; 
	fi

init_db:
	@if command -v psql >/dev/null 2>&1; then 
		psql -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) -tc "SELECT 1 FROM pg_database WHERE datname = '$(POSTGRES_DB)'" 2>/dev/null | grep -q 1 || 
		psql -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) -c "CREATE DATABASE $(POSTGRES_DB) OWNER $(POSTGRES_USER);" 2>/dev/null || 
		(sudo -u postgres psql -c "ALTER USER $(POSTGRES_USER) WITH PASSWORD '$(POSTGRES_PASSWORD)';" 2>/dev/null || true; 
		 sudo -u postgres psql -c "CREATE DATABASE $(POSTGRES_DB) OWNER $(POSTGRES_USER);" 2>/dev/null || true); 
	fi

migrate_db:
	@if [ ! -f .env.secrets ] && [ -f .env.secrets.tpl ]; then \
		cp .env.secrets.tpl .env.secrets; \
	fi
	@if [ ! -f pulse-query-backend/.env ] && [ -f pulse-query-backend/.env.tpl ]; then \
		cp pulse-query-backend/.env.tpl pulse-query-backend/.env; \
	fi
	$(VENV_ACTIVATE) cd pulse-query-backend && PYTHONPATH=src alembic upgrade head

seed_db:
	@if [ ! -f .env.secrets ] && [ -f .env.secrets.tpl ]; then \
		cp .env.secrets.tpl .env.secrets; \
	fi
	@if [ ! -f pulse-query-backend/.env ] && [ -f pulse-query-backend/.env.tpl ]; then \
		cp pulse-query-backend/.env.tpl pulse-query-backend/.env; \
	fi
	$(VENV_ACTIVATE) cd pulse-query-backend && PYTHONPATH=src python3 scripts/ingest.py
	$(VENV_ACTIVATE) cd pulse-query-backend && PYTHONPATH=src python3 scripts/seed_templates.py

setup_db: install_db init_db migrate_db seed_db

# ------------------------------------------------------------------------------
# Native Backend Targets (FastAPI)
# ------------------------------------------------------------------------------

setup_backend:
	@$(VENV_ACTIVATE) if [ -z "$$VIRTUAL_ENV" ]; then \
		if command -v uv >/dev/null 2>&1; then \
			uv venv --python 3.12 pulse-query-backend/.venv; \
		else \
			python3 -m venv pulse-query-backend/.venv; \
		fi; \
	fi
	@if [ ! -f .env.secrets ] && [ -f .env.secrets.tpl ]; then \
		cp .env.secrets.tpl .env.secrets; \
	fi
	@if [ ! -f pulse-query-backend/.env ] && [ -f pulse-query-backend/.env.tpl ]; then \
		cp pulse-query-backend/.env.tpl pulse-query-backend/.env; \
	fi
	$(VENV_ACTIVATE) cd pulse-query-backend && python3 -m pip install -r requirements.txt -r requirements-dev.txt && python3 -m pip install -e .

build_backend:
	$(VENV_ACTIVATE) cd pulse-query-backend && python3 -m pip install -e .

dev_backend:
	$(VENV_ACTIVATE) cd pulse-query-backend && PYTHONPATH=src uvicorn --app-dir src app.main:app --reload --port 8000

# ------------------------------------------------------------------------------
# Native Frontend Targets (Angular + OpenAPI SDK)
# ------------------------------------------------------------------------------

setup_frontend:
	cd pulse-query-ng-web && npm install --legacy-peer-deps

generate_client:
	./generate_client.sh

build_frontend:
	cd pulse-query-ng-web && npm run build

dev_frontend:
	cd pulse-query-ng-web && npm start

# ------------------------------------------------------------------------------
# Composite Native Targets
# ------------------------------------------------------------------------------

install_deps: setup_backend setup_frontend

build: build_frontend build_backend

build_docs:
	mkdir -p $(DOCS_DIR)
	$(VENV_ACTIVATE) cd pulse-query-backend && interrogate -vv --fail-under=100 src/app
	cd pulse-query-ng-web && npm run docs:coverage && npm run docs
	@echo "Docs built in $(DOCS_DIR)"

serve:
	@if [ ! -d pulse-query-ng-web/dist ]; then 
		cd pulse-query-ng-web && npm run build; 
	fi
	$(VENV_ACTIVATE) cd pulse-query-backend && DEBUG=1 PYTHONPATH=src uvicorn --app-dir src app.main:app --reload --port 8000

setup_native: install_base install_deps setup_db build

setup: setup_native

run_native:
	@if [ -f "$(LIBSCRIPT_CLI)" ]; then 
		"$(LIBSCRIPT_CLI)" start libscript.json; 
	else 
		$(MAKE) serve; 
	fi

start_stack:
	"$(LIBSCRIPT_CLI)" start libscript.json

stop_stack:
	"$(LIBSCRIPT_CLI)" stop libscript.json

status_stack:
	"$(LIBSCRIPT_CLI)" status libscript.json

health_stack:
	"$(LIBSCRIPT_CLI)" health libscript.json

logs_stack:
	"$(LIBSCRIPT_CLI)" logs libscript.json

train_ml:
	"$(LIBSCRIPT_CLI)" train libscript.json

infer_ml:
	"$(LIBSCRIPT_CLI)" infer libscript.json

test:
	$(VENV_ACTIVATE) cd pulse-query-backend && pytest
	cd pulse-query-ng-web && npm run test -- --watch=false

test_native: test

clean_native:
	rm -rf pulse-query-ng-web/dist pulse-query-ng-web/.angular pulse-query-backend/.pytest_cache pulse-query-backend/.coverage $(DOCS_DIR)

fmt:
	$(VENV_ACTIVATE) ruff format .
	cd pulse-query-ng-web && npm run format
