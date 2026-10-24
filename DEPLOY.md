# Stanford HealthPlatform - Deployment Guide

This repository contains the configuration and source code for the Stanford HealthPlatform Hospital Dashboard Platform (`pulse-query`). This document provides step-by-step instructions on how to use `libscript` and `.env` to orchestrate, build, deploy, manage, backup, restore, and tear down this stack across local environments, cloud virtual machines, and ML accelerators (GCP TPU VMs, GPU VMs, and GKE XPK clusters).

## Prerequisites

Ensure `libscript` is cloned locally (default: `~/repos/libscript` on POSIX or `%USERPROFILE%\repos\libscript` on Windows), `.env` and `.env.secrets` (copied from `.env.secrets.tpl`) are configured at the repository root, and you are authenticated to your chosen cloud provider when deploying remotely:

- **Default Cloud Provider (`$DEFAULT_CLOUD_PROVIDER`)**: `$CLOUD_CLI_LOGIN_HINT`
- **AWS**: `aws configure`
- **GCP**: `gcloud auth login`

---

## 1. Declarative Stack Orchestration (`libscript.json` & `.env`)

All host, OS, service account (`SERVICE_USER`), filesystem path (`DATA_MOUNT_DIR`, `DUCKDB_PATH`), and cloud defaults (`CLOUD_PROVIDER`, `LOCATION`, `RG_NAME`, `VM_OS_IMAGE`) are centralized in `.env`. The `libscript.json` manifest at the repository root declares the full 5-tier application stack referencing `.env`:

- **Dependencies (`deps` & `dependencies`)**: `python 3.12`, `nodejs 22`, `postgres 18`, `duckdb latest`, `nginx latest`, `ollama latest`, and `uv latest`.
- **Databases (`databases`)**: Automatically provisioned via `_lib/databases/provision_db.sh` (`.cmd`), initializing the `pulse_query_db` PostgreSQL database and `${DUCKDB_PATH}` analytical store and emitting connection strings to `.env.libscript`.
- **Frontends (`frontends`)**: Built and staged via `_lib/app-servers/provision_frontend.sh` (`.cmd`), supporting both the Angular 17+ SPA (`pulse-query-ng-web/dist/pulse-query-ng-web/browser`) and the Kotlin Multiplatform (KMP) Web WasmJS/JS bundle (`PulseQuery`).
- **Services (`services`)**: Managed via `_lib/init-systems/daemonize.sh` (`.cmd`) across `${INIT_SYSTEM}`, macOS `launchd`, Windows background runners, and POSIX container fallbacks under `${SERVICE_USER}`.
- **Ingress (`ingress`)**: Applied via `_lib/networking/netctl/cli.sh apply libscript.json` (`.cmd`), emitting Nginx/Caddy/Apache configuration with SPA `try_files $uri $uri/ /index.html` fallback, WebAssembly (`application/wasm wasm;`) MIME types, and WebSocket `Upgrade` headers for `/api` and `/ws`.
- **Lifecycle Hooks (`hooks`)**: Executes `pre_install`, `install`, `post_install`, `build`, `db_migrate` (Alembic migrations, synthetic clinical CSV ingestion, and template seeding), `pre_start`, and `health` hooks via `_lib/orchestration/run_hooks.sh` (`.cmd`).
- **ML & MPAX Optimization (`ml`)**: Routes `libscript.sh train` and `libscript.sh infer` across local JAX/MPAX execution and cloud TPU/GPU/XPK targets.

### Local Lifecycle Commands

```bash
# Install all resolved stack dependencies and run database migrations
~/repos/libscript/libscript.sh install-deps libscript.json

# Start databases, run build/migration hooks, launch backend daemon, and apply Nginx ingress
~/repos/libscript/libscript.sh start libscript.json

# Inspect service and dependency status, health checks, and logs
~/repos/libscript/libscript.sh status libscript.json
~/repos/libscript/libscript.sh health libscript.json
~/repos/libscript/libscript.sh logs libscript.json

# Stop all managed services
~/repos/libscript/libscript.sh stop libscript.json
```

**Windows (`.cmd`):**

```cmd
%USERPROFILE%
epos\libscript\libscript.cmd install-deps libscript.json
%USERPROFILE%
epos\libscript\libscript.cmd start libscript.json
%USERPROFILE%
epos\libscript\libscript.cmd status libscript.json
%USERPROFILE%
epos\libscript\libscript.cmd health libscript.json
%USERPROFILE%
epos\libscript\libscript.cmd logs libscript.json
%USERPROFILE%
epos\libscript\libscript.cmd stop libscript.json
```

### Frontend & Kotlin Multiplatform (KMP) Builds (`provision_frontend` & `android-sdk`)

```bash
# Build and stage Angular 17+ and KMP Web (WasmJS/JS) distributions into webroot/
~/repos/libscript/_lib/app-servers/provision_frontend.sh --app-dir . --manifest libscript.json --packaging libscript.json

# Install the Android SDK toolchain via LibScript for KMP Android targets
~/repos/libscript/libscript.sh install android-sdk latest

# Emit Nginx reverse-proxy configuration with SPA fallback, WASM MIME types, and WebSocket headers
~/repos/libscript/_lib/networking/netctl/cli.sh apply libscript.json --format nginx --out /tmp/pulse-query.nginx.conf
```

### Declarative ML & MPAX Arena Execution (`train` & `infer`)

```bash
# Run MPAX/JAX scenario generation and benchmark evaluation locally
~/repos/libscript/libscript.sh train libscript.json

# Score MPAX Arena optimization scenarios locally
~/repos/libscript/libscript.sh infer libscript.json

# Preview or dispatch training/inference workloads to GCP TPU VMs, GPU VMs, or GKE XPK clusters
~/repos/libscript/libscript.sh train libscript.json --target gcp-tpu-vm --dry-run
~/repos/libscript/libscript.sh infer libscript.json --target gke-xpk --dry-run
```

---

## 2. Automated Cloud Stack Provisioning (`provision`)

To provision the cloud infrastructure using `.env` settings, mount the persistent data disk (`$DATA_MOUNT_DIR`), install dependencies (`python 3.12`, `nodejs 22`, `postgres 18`, `nginx`, `duckdb`, `ollama`, `uv`), provision databases, run database migrations, build the Angular frontend, configure Nginx ingress routing via `netctl`, and start the `pulse-query-backend` service daemon:

**Configured Default Cloud Provider (`.env`):**

```bash
set -a && . ./.env && { [ ! -f ./.env.secrets ] || . ./.env.secrets; } && set +a
~/repos/libscript/libscript.sh provision "$CLOUD_PROVIDER" pulse-query-node "$PROD_RG_NAME" "$LOCATION" "$(pwd)" "$REMOTE_DEST"
```

**AWS:**

```bash
~/repos/libscript/libscript.sh provision aws pulse-query-node pulse-query-vpc "$DEFAULT_AWS_LOCATION" "$(pwd)" "$REMOTE_DEST"
```

**GCP:**

```bash
~/repos/libscript/libscript.sh provision gcp pulse-query-node healthplatform-project "$DEFAULT_GCP_LOCATION" "$(pwd)" "$REMOTE_DEST"
```

### Direct Node Provisioning (Cloud Provider Subcommands)

If you need to create compute nodes or node groups directly via `libscript`:

**AWS EC2:**

```bash
~/repos/libscript/libscript.sh cloud aws node-group create healthplatform-node 1 "$AWS_VM_IMAGE" healthplatform-vpc --tags Key=Project,Value=StanfordResearch
```

**Default Cloud VM:**

```bash
~/repos/libscript/libscript.sh cloud "$CLOUD_PROVIDER" node create healthplatform-node "$AZURE_VM_IMAGE" healthplatform-rg --vnet-name healthplatform-vnet --tags Project=StanfordResearch
```

**GCP Compute Engine:**

```bash
~/repos/libscript/libscript.sh cloud gcp node create healthplatform-node "$GCP_VM_IMAGE" healthplatform-project --network healthplatform-vpc --labels project=stanfordresearch
```

---

## 3. Provisioning the Backup Target

Before tearing down compute nodes, ensure your object storage bucket exists to hold database snapshots, DuckDB analytical files, and TLS certificates.

**AWS S3:**

```bash
~/repos/libscript/libscript.sh cloud aws storage create stanford-healthplatform-backups
```

**Default Cloud Object Storage:**

```bash
~/repos/libscript/libscript.sh cloud "$CLOUD_PROVIDER" storage create stanfordhealthbackups
```

**GCP Cloud Storage:**

```bash
~/repos/libscript/libscript.sh cloud gcp storage create stanford-healthplatform-backups
```

---

## 4. Backing Up Application State

Trigger a state snapshot from the running compute node to your cloud storage bucket:

```bash
~/repos/libscript/libscript.sh cloud backup pulse-query-node --target "$CLOUD_PROVIDER" --paths "$BACKUP_PATHS" --keep-last 5
```

---

## 5. Deprovisioning (With Data & IP Retention)

To tear down the compute VM while preserving persistent disks and static IP allocations so billing for compute stops without losing data or DNS mappings:

**Standard Teardown:**

```bash
~/repos/libscript/libscript.sh deprovision "$CLOUD_PROVIDER" pulse-query-node "$PROD_RG_NAME" "$LOCATION" "$(pwd)" "$REMOTE_DEST"
```

**Provider-Specific Retention Flags:**

**AWS:**

```bash
~/repos/libscript/libscript.sh deprovision aws pulse-query-node pulse-query-vpc "$DEFAULT_AWS_LOCATION" --retain-ip --retain-data
```

**Default Cloud Provider:**

```bash
~/repos/libscript/libscript.sh deprovision "$CLOUD_PROVIDER" pulse-query-node "$PROD_RG_NAME" "$LOCATION" --retain-ip --retain-data
```

**GCP:**

```bash
~/repos/libscript/libscript.sh deprovision gcp pulse-query-node healthplatform-project "$DEFAULT_GCP_LOCATION" --retain-ip --retain-data
```

---

## 6. Restoration & Reprovisioning

When reprovisioning after a teardown, restore the latest backup snapshot onto the newly created node:

```bash
~/repos/libscript/libscript.sh cloud restore pulse-query-node --from-backup latest
```

---

## 7. Automated Deployment & Health Verification (`test.sh` / `test.cmd`)

To automate provisioning, remote service inspection, and health validation across providers:

```bash
# Run in mock/dry-run mode (safe for local & CI verification)
./test.sh --unit-mock

# Run live cloud deployment and health check on default provider from .env
./test.sh --live-cloud

# Run live cloud deployment on GCP or AWS with remote pytest execution
./test.sh --live-cloud gcp --run-remote-tests
./test.sh --live-cloud aws --run-remote-tests

# Fall back to local execution without cloud provisioning
./test.sh --local
```

**Windows (`test.cmd`):**

```cmd
test.cmd --unit-mock
test.cmd --live-cloud
```

### Reference: CLI Flags (`test.sh` & `test.cmd`)

| Flag                                       | Description                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `--help`, `-h`                             | Show usage information and exit with code `0`.                                                                       |
| `--unit-mock`, `--mock-cloud`, `--dry-run` | Simulates provisioning, remote health checks, and teardown without cloud mutations.                                  |
| `--live-cloud`                             | Enforces live cloud provisioning; performs mandatory pre-flight CLI checks and exits immediately if unauthenticated. |
| `--local`, `-l`                            | Runs local backend and frontend unit test suites.                                                                    |
| `--run-remote-tests`, `-t`                 | Runs `pytest` remotely on the provisioned compute node after health checks pass.                                     |

### Reference: Environment Variables (`.env`)

| Variable             | Source / Default                   | Description                                           |
| -------------------- | ---------------------------------- | ----------------------------------------------------- |
| `SERVICE_USER`       | `.env`                             | Service account user owning application & data files. |
| `DATA_MOUNT_DIR`     | `.env`                             | Persistent data directory path on the host.           |
| `DUCKDB_PATH`        | `.env`                             | Path to the DuckDB analytical database file.          |
| `LIBSCRIPT_ROOT_DIR` | `$HOME/repos/libscript`            | Path to the Libscript root repository.                |
| `LIBSCRIPT_CLI`      | `$LIBSCRIPT_ROOT_DIR/libscript.sh` | Path to Libscript executable wrapper.                 |
| `CLOUD_PROVIDER`     | `.env` (`$DEFAULT_CLOUD_PROVIDER`) | Active cloud provider (`$SUPPORTED_CLOUD_PROVIDERS`). |
| `PROVIDER`           | _(alias for `CLOUD_PROVIDER`)_     | Fallback provider variable if `CLOUD_PROVIDER` unset. |
| `NODE_NAME`          | `.env`                             | Compute instance / VM name.                           |
| `RG_NAME`            | `.env`                             | Resource group, VPC, or project name.                 |
| `LOCATION`           | `.env` (`$DEFAULT_CLOUD_LOCATION`) | Target cloud region or zone.                          |
| `REMOTE_DEST`        | `.env`                             | Target remote destination directory.                  |

### Reference: Exit Codes

| Code | Status  | Meaning                                                                         |
| ---- | ------- | ------------------------------------------------------------------------------- |
| `0`  | Success | Provisioning, remote smoke checks, and deprovisioning succeeded.                |
| `1`  | Failure | Cloud provisioning failed, credentials were missing, or health check timed out. |

---

## 8. System Diagnostics & Health Verification

Once deployed, the platform exposes real-time diagnostic and administrative endpoints:

- `GET /api/v1/system/health`: Verifies DuckDB (`hospital_data`, `Synthetic_hospital_data_transfers`) and PostgreSQL (`templates`) are populated and returns HTTP 200 if healthy or HTTP 503 if empty/critical.
- `GET /api/v1/system/diagnostics`: Full system diagnostics with copyable remediation commands and environment checks.
- `POST /api/v1/system/reingest`: Triggers immediate re-indexing of clinical CSV files into DuckDB tables.
