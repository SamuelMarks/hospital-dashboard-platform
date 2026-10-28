#!/bin/sh
# ## Overview
# End-to-end cloud deployment, health verification, and test execution harness
# for Hospital Dashboard Platform using LibScript.
#
# ## Usage
# ./test.sh [--unit-mock|--mock-cloud|--dry-run] [--live-cloud] [--local|-l] [--run-remote-tests|-t] [provider]

set -feu

if [ "${SCRIPT_NAME-}" ]; then
    THIS_FILE="${SCRIPT_NAME}"
elif [ "${BASH_SOURCE-}" ]; then
    THIS_FILE="${BASH_SOURCE}"
elif [ "${ZSH_VERSION-}" ]; then
    # shellcheck disable=SC2296
    THIS_FILE="${(%):-%x}"
else
    THIS_FILE="${0}"
fi

case "${STACK+x}" in
    *':'"${THIS_FILE}"':'*)
        printf '[STOP]     processing "%s"\n' "${THIS_FILE}" >&2
        if (return 0 2>/dev/null); then return; else exit 0; fi ;;
    *) printf '[CONTINUE] processing "%s"\n' "${THIS_FILE}" >&2 ;;
esac
export STACK="${STACK:-}${THIS_FILE}"':'
SCRIPT_DIR=$(cd -- "$(dirname -- "${THIS_FILE}")" && pwd)
: "${LIBSCRIPT_ROOT_DIR:=$(d="$SCRIPT_DIR"; while [ ! -f "$d/libscript.sh" ]; do n="${d%/*}"; [ -z "$n" ] && n="/"; [ "$d" = "$n" ] && break; d="$n"; done; if [ -f "$d/libscript.sh" ]; then printf '%s\n' "$d"; elif [ -d "$HOME/repos/libscript" ]; then printf '%s\n' "$HOME/repos/libscript"; else printf '%s\n' "$d"; fi)}"

REPO_DIR="$SCRIPT_DIR"

# ## load_env_defaults
# Loads key=value defaults from `.env` without overwriting existing environment variables.
load_env_defaults() {
    _ENV_FILE="$1"
    _DQ='"'
    _SQ="'"
    if [ -f "$_ENV_FILE" ]; then
        while IFS= read -r _LINE || [ -n "$_LINE" ]; do
            case "$_LINE" in
                ''|'#'*) continue ;;
            esac
            _KEY="${_LINE%%=*}"
            _VAL="${_LINE#*=}"
            _VAL="${_VAL#"$_DQ"}"
            _VAL="${_VAL%"$_DQ"}"
            _VAL="${_VAL#"$_SQ"}"
            _VAL="${_VAL%"$_SQ"}"
            if ! export -p | grep -q "^export ${_KEY}="; then
                export "$_KEY=$_VAL"
            fi
        done < "$_ENV_FILE"
    fi
}

CALLER_LOCATION="${LOCATION:-}"
load_env_defaults "$REPO_DIR/.env"
load_env_defaults "$REPO_DIR/.env.secrets"
LOCATION="$CALLER_LOCATION"

# Configuration with configurable defaults from .env
CLOUD_PROVIDER="${PROVIDER:-${CLOUD_PROVIDER:-${DEFAULT_CLOUD_PROVIDER:-cloud}}}"
LIBSCRIPT_ROOT_DIR="${LIBSCRIPT_ROOT_DIR:-$HOME/repos/libscript}"
LIBSCRIPT_CLI="${LIBSCRIPT_CLI:-$LIBSCRIPT_ROOT_DIR/libscript.sh}"
NODE_NAME="${NODE_NAME:-test-pulse-query-node}"
RG_NAME="${RG_NAME:-${DEFAULT_RG_NAME:-default-rg}}"
REMOTE_DEST="${REMOTE_DEST:-hospital-dashboard-platform}"

RUN_LOCAL=0
RUN_REMOTE_TESTS=0
MOCK_CLOUD=0
LIVE_CLOUD=0

if [ "${DRY_RUN:-false}" = "true" ]; then
    MOCK_CLOUD=1
fi

for arg in "$@"; do
    case "$arg" in
        --unit-mock|--mock-cloud|--dry-run)
            MOCK_CLOUD=1
            ;;
        --live-cloud)
            LIVE_CLOUD=1
            ;;
        --local|-l)
            RUN_LOCAL=1
            ;;
        --run-remote-tests|-t)
            RUN_REMOTE_TESTS=1
            ;;
        --help|-h)
            echo "Usage: $0 [--unit-mock|--mock-cloud|--dry-run] [--live-cloud] [--local|-l] [--run-remote-tests|-t] [provider]"
            echo 'Options:'
            echo '  --unit-mock, --mock-cloud, --dry-run  Simulate cloud operations locally without cloud resources.'
            echo '  --live-cloud                          Force live cloud provisioning and execution; fails if auth missing.'
            echo '  --local, -l                           Run tests locally using installed pytest/npm.'
            echo '  --run-remote-tests, -t                Run pytest directly on remote compute instance after provisioning.'
            echo 'Environment variables:'
            echo "  CLOUD_PROVIDER     Cloud provider (${SUPPORTED_CLOUD_PROVIDERS:-gcp,aws}). Default: ${DEFAULT_CLOUD_PROVIDER:-}"
            echo "  LIBSCRIPT_ROOT_DIR Path to Libscript repo. Default: \$HOME/repos/libscript"
            echo "  LIBSCRIPT_CLI      Path to Libscript executable wrapper. Default: \$LIBSCRIPT_ROOT_DIR/libscript.sh"
            echo "  NODE_NAME          Name of compute node. Default: ${NODE_NAME}"
            echo "  RG_NAME            Resource group or project name. Default: ${RG_NAME}"
            echo "  LOCATION           Cloud region/datacenter. Default: ${DEFAULT_CLOUD_LOCATION:-}"
            echo "  REMOTE_DEST        Destination folder on remote node. Default: ${REMOTE_DEST}"
            exit 0
            ;;
        -*)
            echo "Error: Unknown option '$arg'" >&2
            exit 1
            ;;
        *)
            CLOUD_PROVIDER="$arg"
            ;;
    esac
done

if [ -z "${LOCATION:-}" ]; then
    case "$CLOUD_PROVIDER" in
        aws) LOCATION="${DEFAULT_AWS_LOCATION:-us-east-1}" ;;
        gcp) LOCATION="${DEFAULT_GCP_LOCATION:-us-central1-a}" ;;
        *)   LOCATION="${DEFAULT_CLOUD_LOCATION:-}" ;;
    esac
fi

if [ "$MOCK_CLOUD" -eq 1 ]; then
    echo '=========================================================='
    echo 'Running in Mock Cloud mode (--mock-cloud specified)...'
    echo "Simulating provisioning on $CLOUD_PROVIDER ($NODE_NAME)..."
    echo '=========================================================='
    MOCK_CLEANED_UP=0
    # ## mock_cleanup
    # Simulates cloud resource teardown on exit or signal in mock mode.
    mock_cleanup() {
        if [ "$MOCK_CLEANED_UP" -eq 0 ]; then
            MOCK_CLEANED_UP=1
            echo "Mock deprovisioning cloud resources on $CLOUD_PROVIDER ($NODE_NAME)..."
            echo 'Deprovisioning complete.'
        fi
    }
    trap mock_cleanup EXIT INT TERM

    echo 'Verifying remote execution...'
    echo 'Deployment test successful'
    echo 'Verifying backend API health status on remote host...'
    echo '{"status": "healthy", "datasets": {"status": "ready", "table_count": 2, "row_counts": {"hospital_data": 700, "Synthetic_hospital_data_transfers": 41692}}, "templates": {"status": "ready", "template_count": 29}}'
    echo 'Verifying frontend web service on remote host...'
    echo 'HTTP/1.1 200 OK'
    if [ "$RUN_REMOTE_TESTS" -eq 1 ]; then
        echo 'Running test suite on mock remote instance...'
        pytest -q
    fi
    echo 'Deployment and remote health verification passed successfully.'
    exit 0
fi

if [ "$RUN_LOCAL" -eq 1 ] || [ ! -x "$LIBSCRIPT_CLI" ]; then
    echo '=========================================================='
    if [ "$RUN_LOCAL" -eq 1 ]; then
        echo 'Running test suite locally (--local specified)...'
    else
        echo "Libscript CLI not found at '$LIBSCRIPT_CLI'."
        echo 'Falling back to local test suite...'
    fi
    echo '=========================================================='
    if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
        HEALTH_JSON=$(curl -sf http://127.0.0.1:8000/api/v1/system/health 2>/dev/null || true)
        if [ -n "$HEALTH_JSON" ]; then
            echo "$HEALTH_JSON" | jq -e '.status == "healthy" and .datasets.status == "ready" and .datasets.table_count >= 2 and (.datasets.row_counts.hospital_data // 0) > 0 and (.datasets.row_counts.Synthetic_hospital_data_transfers // 0) > 0 and .templates.status == "ready" and .templates.template_count >= 10' >/dev/null
        fi
    fi
    if [ -d "pulse-query-backend" ]; then
        (cd pulse-query-backend && pytest)
    else
        pytest
    fi
    if [ -d "pulse-query-ng-web" ]; then
        (cd pulse-query-ng-web && npm test)
    fi
    echo 'Local test suite completed successfully.'
    exit 0
fi

CLEANED_UP=0
# ## cleanup
# Deprovisions cloud resources on exit, interrupt, or termination.
cleanup() {
    if [ "$CLEANED_UP" -eq 0 ]; then
        CLEANED_UP=1
        echo "Cleaning up cloud resources on $CLOUD_PROVIDER ($NODE_NAME)..."
        "$LIBSCRIPT_CLI" deprovision "$CLOUD_PROVIDER" "$NODE_NAME" "$RG_NAME" "$LOCATION" "$REPO_DIR" "$REMOTE_DEST" || echo 'Cleanup failed, but continuing.'
        echo 'Deprovisioning complete.'
    fi
}

trap cleanup EXIT INT TERM

# ## check_cloud_credentials
# Validates cloud CLI installation and authentication status for the active provider.
check_cloud_credentials() {
    echo "Verifying CLI authentication credentials for '$CLOUD_PROVIDER'..."
    case "$CLOUD_PROVIDER" in
        "${DEFAULT_CLOUD_PROVIDER:-}")
            if [ -n "${CLOUD_CLI_BIN:-}" ] && command -v "$CLOUD_CLI_BIN" >/dev/null 2>&1; then
                # shellcheck disable=SC2086
                if ! "$CLOUD_CLI_BIN" ${CLOUD_CLI_AUTH_ARGS:-} >/dev/null 2>&1; then
                    echo "WARNING: ${CLOUD_CLI_DISPLAY_NAME:-Cloud} CLI not authenticated. Run '${CLOUD_CLI_LOGIN_HINT:-}'." >&2
                    if [ "$LIVE_CLOUD" -eq 1 ]; then
                        echo "ERROR: --live-cloud requires authenticated ${CLOUD_CLI_DISPLAY_NAME:-Cloud} credentials." >&2
                        exit 1
                    fi
                fi
            elif [ "$LIVE_CLOUD" -eq 1 ]; then
                echo "ERROR: ${CLOUD_CLI_DISPLAY_NAME:-Cloud} CLI ('${CLOUD_CLI_BIN:-}') not found." >&2
                exit 1
            fi
            ;;
        gcp)
            if command -v gcloud >/dev/null 2>&1; then
                if ! gcloud auth print-access-token >/dev/null 2>&1; then
                    echo "WARNING: Google Cloud CLI not authenticated. Run 'gcloud auth login'." >&2
                    if [ "$LIVE_CLOUD" -eq 1 ]; then
                        echo 'ERROR: --live-cloud requires authenticated GCP credentials.' >&2
                        exit 1
                    fi
                fi
            elif [ "$LIVE_CLOUD" -eq 1 ]; then
                echo "ERROR: Google Cloud CLI ('gcloud') not found." >&2
                exit 1
            fi
            ;;
        aws)
            if command -v aws >/dev/null 2>&1; then
                if ! aws sts get-caller-identity >/dev/null 2>&1; then
                    echo "WARNING: AWS CLI not authenticated. Run 'aws configure'." >&2
                    if [ "$LIVE_CLOUD" -eq 1 ]; then
                        echo 'ERROR: --live-cloud requires authenticated AWS credentials.' >&2
                        exit 1
                    fi
                fi
            elif [ "$LIVE_CLOUD" -eq 1 ]; then
                echo "ERROR: AWS CLI ('aws') not found." >&2
                exit 1
            fi
            ;;
    esac
}

START_TIME=$(date +%s)
check_cloud_credentials

echo "Starting $CLOUD_PROVIDER deployment test for hospital-dashboard-platform..."
echo "Node: $NODE_NAME, Target: $RG_NAME ($LOCATION)"

# Provision the stack
if ! "$LIBSCRIPT_CLI" provision "$CLOUD_PROVIDER" "$NODE_NAME" "$RG_NAME" "$LOCATION" "$REPO_DIR" "$REMOTE_DEST"; then
    echo "ERROR: Provisioning failed on $CLOUD_PROVIDER." >&2
    exit 1
fi

# ## remote_exec
# Executes a shell command on the provisioned remote compute node via LibScript.
remote_exec() {
    _CMD="$1"
    if [ -f "$LIBSCRIPT_ROOT_DIR/_lib/cloud-providers/$CLOUD_PROVIDER/cli.sh" ]; then
        "$LIBSCRIPT_ROOT_DIR/_lib/cloud-providers/$CLOUD_PROVIDER/cli.sh" node exec "$NODE_NAME" "$RG_NAME" "$_CMD"
    else
        "$LIBSCRIPT_CLI" cloud "$CLOUD_PROVIDER" node exec "$NODE_NAME" "$RG_NAME" "$_CMD"
    fi
}

# 1. Verify remote node execution connectivity
echo 'Verifying remote execution...'
if ! remote_exec "echo 'Deployment test successful'"; then
    echo "ERROR: Remote connectivity test failed on $CLOUD_PROVIDER ($NODE_NAME)." >&2
    exit 1
fi

# 2. Verify backend API health endpoint
echo 'Verifying backend API health status on remote host...'
if ! remote_exec 'HEALTH_JSON=$(curl -sf http://localhost:8000/api/v1/system/health || curl -sf http://127.0.0.1:8000/api/v1/system/health) && echo "$HEALTH_JSON" | jq -e '\''.status == "healthy" and .datasets.status == "ready" and .datasets.table_count >= 2 and (.datasets.row_counts.hospital_data // 0) > 0 and (.datasets.row_counts.Synthetic_hospital_data_transfers // 0) > 0 and .templates.status == "ready" and .templates.template_count >= 10'\'''; then
    echo 'WARNING: Backend API health endpoint check failed. Gathering diagnostic logs...'
    remote_exec "${BACKEND_DIAG_LOG_CMD:-docker logs --tail 30 pulse-query-backend} 2>/dev/null || docker logs --tail 30 pulse-query-backend 2>/dev/null || true"
    exit 1
fi

# 3. Verify frontend response
echo 'Verifying frontend web service on remote host...'
if ! remote_exec "curl -sf -I http://localhost:80/ || curl -sf -I http://127.0.0.1:80/"; then
    echo 'WARNING: Frontend check failed. Gathering diagnostic logs...'
    remote_exec "${FRONTEND_DIAG_LOG_CMD:-docker logs --tail 30 pulse-query-frontend} 2>/dev/null || docker logs --tail 30 pulse-query-frontend 2>/dev/null || true"
    exit 1
fi

# 4. Optional: Run full test suite on remote compute instance
if [ "$RUN_REMOTE_TESTS" -eq 1 ]; then
    echo 'Running test suite on remote instance...'
    if ! remote_exec "cd $REMOTE_DEST/pulse-query-backend && pytest -q"; then
        echo 'ERROR: Remote test suite failed.' >&2
        exit 1
    fi
    echo 'Remote test suite passed.'
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo "Deployment and remote health verification passed successfully in ${DURATION}s."
