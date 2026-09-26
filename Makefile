.PHONY: build_docker run_docker test_docker clean_docker install_base install_deps build_docs build dev_backend serve test fmt help

DOCS_DIR ?= docs
COMPOSE_FILE ?= docker-compose.yml
DOCKER_COMPOSE ?= $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)
VENV_ACTIVATE := $(shell for d in .venv venv .venv-* venv-* pulse-query-backend/.venv pulse-query-backend/venv pulse-query-backend/.venv-* pulse-query-backend/venv-*; do if [ -f "$$d/bin/activate" ]; then echo ". $(CURDIR)/$$d/bin/activate && "; break; fi; done)

help:
	@echo "Available commands:"
	@echo "  build_docker  Build the docker containers"
	@echo "  run_docker    Run the docker containers"
	@echo "  test_docker   Run tests in docker containers"
	@echo "  clean_docker  Clean up docker containers"
	@echo "  install_base  Install language runtime and tools"
	@echo "  install_deps  Install local dependencies"
	@echo "  build_docs    Build the API docs (override with DOCS_DIR=$(DOCS_DIR))"
	@echo "  build         Build the frontend and backend"
	@echo "  dev_backend   Start the local dev server backend"
	@echo "  serve         Serve the frontend behind the backend local dir static file server (which is enabled in DEBUG mode only)"
	@echo "  test          Run tests locally"
	@echo "  fmt           Format the frontend and backend code"
	@echo "  help          Show help text"

build_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) build

run_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up

test_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) run --rm backend pytest
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) run --rm frontend npm run test

clean_docker:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down -v

install_base:
	$(VENV_ACTIVATE) python3 -m pip install --upgrade pip
	npm install -g npm

install_deps:
	$(VENV_ACTIVATE) cd pulse-query-backend && python3 -m pip install -r requirements.txt -r requirements-dev.txt
	cd pulse-query-ng-web && npm install

build_docs:
	mkdir -p $(DOCS_DIR)
	$(VENV_ACTIVATE) cd pulse-query-backend && interrogate -vv --fail-under=100 src/app
	cd pulse-query-ng-web && npm run docs
	@echo "Docs built in $(DOCS_DIR)"

build:
	cd pulse-query-ng-web && npm run build
	$(VENV_ACTIVATE) cd pulse-query-backend && python3 -m pip install -e .

dev_backend:
	$(VENV_ACTIVATE) cd pulse-query-backend && uvicorn app.main:app --reload --port 8000

serve:
	$(VENV_ACTIVATE) cd pulse-query-backend && DEBUG=1 uvicorn app.main:app --reload --port 8000

test:
	$(VENV_ACTIVATE) cd pulse-query-backend && pytest
	cd pulse-query-ng-web && npm run test

fmt:
	$(VENV_ACTIVATE) ruff format .
	cd pulse-query-ng-web && npm run format
