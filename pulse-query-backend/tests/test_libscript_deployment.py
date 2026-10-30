"""Comprehensive unit tests for .env, libscript.json, test.sh, test.cmd, and DEPLOY.md."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import stat
import subprocess

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE_PATH = REPO_ROOT / ".env"
ENV_SECRETS_TPL_PATH = REPO_ROOT / ".env.secrets.tpl"
GITIGNORE_PATH = REPO_ROOT / ".gitignore"
TEST_SH_PATH = REPO_ROOT / "test.sh"
TEST_CMD_PATH = REPO_ROOT / "test.cmd"


def _parse_env_file(path: Path) -> dict[str, str]:
  """
  Parse key=value pairs from an env-formatted file.

  Args:
      path (Path): Path to the `.env` file to parse.

  Returns:
      dict[str, str]: Mapping of environment variable keys to unquoted string values.
  """
  values: dict[str, str] = {}
  if path.is_file():
    for raw_line in path.read_text(encoding="utf-8").splitlines():
      line = raw_line.strip()
      if not line or line.startswith("#") or "=" not in line:
        continue
      k, v = line.split("=", 1)
      values[k.strip()] = v.strip().strip('"').strip("'")
  return values


def load_repo_env() -> dict[str, str]:
  """
  Parse key=value pairs from the root `.env` file.

  Returns:
      dict[str, str]: Mapping of root `.env` keys to string values.
  """
  return _parse_env_file(ENV_FILE_PATH)


def make_executable(script_path: Path, content: str) -> None:
  """Write an executable shell script to disk."""
  script_path.write_text(content, encoding="utf-8")
  script_path.chmod(script_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def run_test_sh(
  args: list[str],
  env_overrides: dict[str, str] | None = None,
  cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
  """Execute test.sh with isolated environment overrides."""
  env = os.environ.copy()
  if env_overrides:
    env.update(env_overrides)
  return subprocess.run(
    ["/bin/sh", str(TEST_SH_PATH), *args],
    cwd=str(cwd or REPO_ROOT),
    capture_output=True,
    text=True,
    env=env,
    check=False,
    timeout=10,
  )


def test_test_sh_help_and_unknown_flag() -> None:
  """Test that test.sh --help, -h, and unknown flags behave as expected."""
  for flag in ["--help", "-h"]:
    res = run_test_sh([flag])
    assert res.returncode == 0
    assert "Usage: " in res.stdout
    assert "--unit-mock, --mock-cloud" in res.stdout
    assert "--live-cloud" in res.stdout
    assert "--local, -l" in res.stdout
    assert "CLOUD_PROVIDER" in res.stdout

  res_unknown = run_test_sh(["--unknown-flag"])
  assert res_unknown.returncode == 1
  assert "Error: Unknown option '--unknown-flag'" in res_unknown.stderr


def test_test_sh_mock_cloud_modes(tmp_path: Path) -> None:
  """Test test.sh mock cloud modes with and without remote test execution."""
  bin_dir = tmp_path / "bin"
  bin_dir.mkdir()
  fake_pytest = bin_dir / "pytest"
  make_executable(
    fake_pytest,
    """#!/bin/sh
echo 'fake pytest passed'
exit 0
""",
  )

  env = {"PATH": f"{bin_dir}:{os.environ['PATH']}"}

  for flag in ["--unit-mock", "--mock-cloud", "--dry-run"]:
    res = run_test_sh([flag], env_overrides=env)
    assert res.returncode == 0
    assert "Running in Mock Cloud mode" in res.stdout
    assert "Deployment test successful" in res.stdout
    assert "Deployment and remote health verification passed successfully." in res.stdout
    assert "Mock deprovisioning cloud resources" in res.stdout
    assert "Deprovisioning complete." in res.stdout

  # DRY_RUN=true environment variable
  res_dry = run_test_sh(["aws"], env_overrides={**env, "DRY_RUN": "true"})
  assert res_dry.returncode == 0
  assert "Simulating provisioning on aws" in res_dry.stdout

  # With remote tests
  for flag in ["--run-remote-tests", "-t"]:
    res_t = run_test_sh(["--mock-cloud", flag, "gcp"], env_overrides=env)
    assert res_t.returncode == 0
    assert "Running test suite on mock remote instance..." in res_t.stdout


def test_test_sh_local_tests(tmp_path: Path) -> None:
  """Test test.sh --local flag and automatic fallback when Libscript CLI is missing."""
  bin_dir = tmp_path / "bin"
  bin_dir.mkdir()
  fake_pytest = bin_dir / "pytest"
  make_executable(
    fake_pytest,
    """#!/bin/sh
echo 'local pytest executed'
exit 0
""",
  )
  fake_npm = bin_dir / "npm"
  make_executable(
    fake_npm,
    """#!/bin/sh
echo 'local npm test executed'
exit 0
""",
  )

  env = {
    "PATH": f"{bin_dir}:{os.environ['PATH']}",
    "LIBSCRIPT_CLI": str(tmp_path / "nonexistent-libscript.sh"),
  }

  # 1. Fallback when CLI missing (with pulse-query-backend and pulse-query-ng-web dirs)
  workdir_with_dirs = tmp_path / "repo1"
  workdir_with_dirs.mkdir()
  (workdir_with_dirs / "pulse-query-backend").mkdir()
  (workdir_with_dirs / "pulse-query-ng-web").mkdir()
  res_fallback = run_test_sh([], env_overrides=env, cwd=workdir_with_dirs)
  assert res_fallback.returncode == 0
  assert "Libscript CLI not found" in res_fallback.stdout
  assert "Local test suite completed successfully." in res_fallback.stdout

  # 2. Explicit --local and -l without subdirectories
  workdir_no_dirs = tmp_path / "repo2"
  workdir_no_dirs.mkdir()
  for flag in ["--local", "-l"]:
    res_local = run_test_sh([flag], env_overrides=env, cwd=workdir_no_dirs)
    assert res_local.returncode == 0
    assert "Running test suite locally (--local specified)..." in res_local.stdout
    assert "Local test suite completed successfully." in res_local.stdout


def test_test_sh_cloud_credentials_verification(tmp_path: Path) -> None:
  """Test check_cloud_credentials for the configured default provider, gcp, aws, and unknown providers."""
  env_cfg = load_repo_env()
  default_provider = env_cfg["DEFAULT_CLOUD_PROVIDER"]
  cli_bin = env_cfg["CLOUD_CLI_BIN"]
  display_name = env_cfg["CLOUD_CLI_DISPLAY_NAME"]
  login_hint = env_cfg["CLOUD_CLI_LOGIN_HINT"]

  bin_dir = tmp_path / "bin"
  bin_dir.mkdir()
  fake_cli = tmp_path / "libscript.sh"
  make_executable(
    fake_cli,
    """#!/bin/sh
exit 1
""",
  )

  def create_tool(name: str, exit_code: int) -> None:
    """Create a mock tool executable with a fixed exit code."""
    p = bin_dir / name
    make_executable(
      p,
      f"""#!/bin/sh
exit {exit_code}
""",
    )

  # 1. Default cloud provider credential checks from .env
  create_tool(cli_bin, 0)
  env = {
    "PATH": f"{bin_dir}:{os.environ['PATH']}",
    "CLOUD_PROVIDER": default_provider,
    "LIBSCRIPT_CLI": str(fake_cli),
  }
  res = run_test_sh([], env_overrides=env)
  assert f"Verifying CLI authentication credentials for '{default_provider}'..." in res.stdout
  assert f"ERROR: Provisioning failed on {default_provider}." in res.stderr

  create_tool(cli_bin, 1)
  res_warn = run_test_sh([], env_overrides=env)
  assert f"WARNING: {display_name} CLI not authenticated. Run '{login_hint}'." in res_warn.stderr

  res_live_fail = run_test_sh(["--live-cloud"], env_overrides=env)
  assert res_live_fail.returncode == 1
  assert f"ERROR: --live-cloud requires authenticated {display_name} credentials." in res_live_fail.stderr

  isolated_bin = tmp_path / "isolated_bin"
  isolated_bin.mkdir()
  for tool_name in [
    "date",
    "dirname",
    "basename",
    "sh",
    "echo",
    "pwd",
    "cat",
    "grep",
    "[",
    "test",
  ]:
    tool_src = shutil.which(tool_name)
    assert tool_src is not None
    dest = isolated_bin / tool_name
    dest.symlink_to(tool_src)

  (bin_dir / cli_bin).unlink()
  env_clean = {
    "PATH": str(isolated_bin),
    "CLOUD_PROVIDER": default_provider,
    "LIBSCRIPT_CLI": str(fake_cli),
  }
  res_default_missing = run_test_sh(["--live-cloud"], env_overrides=env_clean)
  assert res_default_missing.returncode == 1
  assert f"ERROR: {display_name} CLI ('{cli_bin}') not found." in res_default_missing.stderr

  # 2. GCP credential checks
  create_tool("gcloud", 0)
  env["CLOUD_PROVIDER"] = "gcp"
  res_gcp = run_test_sh([], env_overrides=env)
  assert "Verifying CLI authentication credentials for 'gcp'..." in res_gcp.stdout

  create_tool("gcloud", 1)
  res_gcp_warn = run_test_sh([], env_overrides=env)
  assert "WARNING: Google Cloud CLI not authenticated." in res_gcp_warn.stderr

  res_gcp_live_fail = run_test_sh(["--live-cloud"], env_overrides=env)
  assert res_gcp_live_fail.returncode == 1
  assert "ERROR: --live-cloud requires authenticated GCP credentials." in res_gcp_live_fail.stderr

  (bin_dir / "gcloud").unlink()
  res_gcloud_missing = run_test_sh(
    ["--live-cloud"],
    env_overrides={**env_clean, "CLOUD_PROVIDER": "gcp"},
  )
  assert res_gcloud_missing.returncode == 1
  assert "ERROR: Google Cloud CLI ('gcloud') not found." in res_gcloud_missing.stderr

  # 3. AWS credential checks
  create_tool("aws", 0)
  env["CLOUD_PROVIDER"] = "aws"
  res_aws = run_test_sh([], env_overrides=env)
  assert "Verifying CLI authentication credentials for 'aws'..." in res_aws.stdout

  create_tool("aws", 1)
  res_aws_warn = run_test_sh([], env_overrides=env)
  assert "WARNING: AWS CLI not authenticated." in res_aws_warn.stderr

  res_aws_live_fail = run_test_sh(["--live-cloud"], env_overrides=env)
  assert res_aws_live_fail.returncode == 1
  assert "ERROR: --live-cloud requires authenticated AWS credentials." in res_aws_live_fail.stderr

  (bin_dir / "aws").unlink()
  res_aws_missing = run_test_sh(
    ["--live-cloud"],
    env_overrides={**env_clean, "CLOUD_PROVIDER": "aws"},
  )
  assert res_aws_missing.returncode == 1
  assert "ERROR: AWS CLI ('aws') not found." in res_aws_missing.stderr

  # 4. Unknown cloud provider
  env["CLOUD_PROVIDER"] = "custom_cloud"
  res_custom = run_test_sh([], env_overrides=env)
  assert "Verifying CLI authentication credentials for 'custom_cloud'..." in res_custom.stdout


def test_test_sh_remote_execution_branches(tmp_path: Path) -> None:
  """Test remote execution verification steps, failures, and diagnostic log collection."""
  cli_script = tmp_path / "libscript.sh"

  # 1. Connectivity test fails
  cli_code_conn_fail = """#!/bin/sh
cmd="$1"
if [ "$cmd" = "provision" ]; then exit 0; fi
if [ "$cmd" = "deprovision" ]; then exit 0; fi
if [ "$cmd" = "cloud" ]; then
    exit 1
fi
exit 0
"""
  make_executable(cli_script, cli_code_conn_fail)
  env = {
    "LIBSCRIPT_CLI": str(cli_script),
    "CLOUD_PROVIDER": "custom_cloud",
  }
  res_conn_fail = run_test_sh([], env_overrides=env)
  assert res_conn_fail.returncode == 1
  assert "ERROR: Remote connectivity test failed" in res_conn_fail.stderr

  # 2. Backend API health check fails
  cli_code_backend_fail = """#!/bin/sh
cmd="$1"
if [ "$cmd" = "provision" ]; then exit 0; fi
if [ "$cmd" = "deprovision" ]; then exit 0; fi
if [ "$cmd" = "cloud" ]; then
    shift 6
    remote_cmd="$1"
    case "$remote_cmd" in
        *Deployment*) exit 0 ;;
        *api/v1/system/health*) exit 1 ;;
        *docker*) echo "mock diagnostic logs collected"; exit 0 ;;
    esac
fi
exit 0
"""
  make_executable(cli_script, cli_code_backend_fail)
  res_back_fail = run_test_sh([], env_overrides=env)
  assert res_back_fail.returncode == 1
  assert "WARNING: Backend API health endpoint check failed. Gathering diagnostic logs..." in res_back_fail.stdout
  assert "mock diagnostic logs collected" in res_back_fail.stdout

  # 3. Frontend check fails
  cli_code_frontend_fail = """#!/bin/sh
cmd="$1"
if [ "$cmd" = "provision" ]; then exit 0; fi
if [ "$cmd" = "deprovision" ]; then exit 0; fi
if [ "$cmd" = "cloud" ]; then
    shift 6
    remote_cmd="$1"
    case "$remote_cmd" in
        *Deployment*) exit 0 ;;
        *api/v1/system/health*) exit 0 ;;
        *:80*) exit 1 ;;
        *docker*) echo "frontend diagnostic logs collected"; exit 0 ;;
    esac
fi
exit 0
"""
  make_executable(cli_script, cli_code_frontend_fail)
  res_front_fail = run_test_sh([], env_overrides=env)
  assert res_front_fail.returncode == 1
  assert "WARNING: Frontend check failed. Gathering diagnostic logs..." in res_front_fail.stdout
  assert "frontend diagnostic logs collected" in res_front_fail.stdout

  # 4. Remote tests fail
  cli_code_remote_fail = """#!/bin/sh
cmd="$1"
if [ "$cmd" = "provision" ]; then exit 0; fi
if [ "$cmd" = "deprovision" ]; then exit 0; fi
if [ "$cmd" = "cloud" ]; then
    shift 6
    remote_cmd="$1"
    case "$remote_cmd" in
        *pytest*) exit 1 ;;
        *) exit 0 ;;
    esac
fi
exit 0
"""
  make_executable(cli_script, cli_code_remote_fail)
  res_rem_fail = run_test_sh(["--run-remote-tests"], env_overrides=env)
  assert res_rem_fail.returncode == 1
  assert "ERROR: Remote test suite failed." in res_rem_fail.stderr

  # 5. Full success with provider-specific cli.sh and remote tests
  libscript_root = tmp_path / "libscript"
  provider_dir = libscript_root / "_lib" / "cloud-providers" / "custom_cloud"
  provider_dir.mkdir(parents=True)
  provider_cli = provider_dir / "cli.sh"
  provider_code = """#!/bin/sh
echo "custom provider cli executing: $*"
exit 0
"""
  make_executable(provider_cli, provider_code)

  cli_code_success = """#!/bin/sh
cmd="$1"
if [ "$cmd" = "provision" ]; then exit 0; fi
if [ "$cmd" = "deprovision" ]; then
    echo "deprovisioning triggered"
    exit 0
fi
exit 0
"""
  make_executable(cli_script, cli_code_success)
  env_success = {
    "LIBSCRIPT_CLI": str(cli_script),
    "LIBSCRIPT_ROOT_DIR": str(libscript_root),
    "CLOUD_PROVIDER": "custom_cloud",
  }
  res_success = run_test_sh(["-t"], env_overrides=env_success)
  assert res_success.returncode == 0
  assert "custom provider cli executing:" in res_success.stdout
  assert "Remote test suite passed." in res_success.stdout
  assert "Deployment and remote health verification passed successfully in " in res_success.stdout
  assert "deprovisioning triggered" in res_success.stdout


def test_test_sh_deprovision_failure_handling(tmp_path: Path) -> None:
  """Test that cleanup handles deprovision command failures gracefully."""
  cli_script = tmp_path / "libscript.sh"
  cli_code = """#!/bin/sh
cmd="$1"
if [ "$cmd" = "provision" ]; then exit 1; fi
if [ "$cmd" = "deprovision" ]; then exit 1; fi
"""
  make_executable(cli_script, cli_code)
  env = {
    "LIBSCRIPT_CLI": str(cli_script),
    "CLOUD_PROVIDER": "custom_cloud",
  }
  res = run_test_sh([], env_overrides=env)
  assert res.returncode == 1
  assert "Cleanup failed, but continuing." in res.stdout


def test_test_cmd_static_and_control_flow_validation() -> None:
  """Statically verify test.cmd batch file labels, branches, flags, and exit codes."""
  assert TEST_CMD_PATH.is_file()
  content = TEST_CMD_PATH.read_text(encoding="utf-8")

  expected_labels = [
    ":parse_args",
    ":show_help",
    ":after_args",
    ":check_cloud_credentials",
    ":cleanup",
    ":run_mock_cloud",
    ":run_local_tests",
  ]
  for label in expected_labels:
    assert label in content, f"Missing label {label} in test.cmd"

  for flag in (
    "--help",
    "-h",
    "--mock-cloud",
    "--unit-mock",
    "--dry-run",
    "--live-cloud",
  ):
    assert flag in content, f"Expected CLI flag '{flag}' in test.cmd"

  assert 'call "%LIBSCRIPT_CLI%" provision' in content
  assert 'call "%LIBSCRIPT_CLI%" deprovision' in content
  assert 'call "%LIBSCRIPT_CLI%" cloud' in content
  assert "echo Deployment test successful" in content
  assert "api/v1/system/health" in content
  assert "npm test" in content
  assert "exit /b !EXIT_CODE!" in content
  assert "Usage: %0" in content
  assert "Running in Mock Cloud mode" in content
  assert "Deprovisioning complete." in content
  assert "exit /b 0" in content
  assert "exit /b 1" in content
  assert "--live-cloud requires authenticated %CLOUD_CLI_DISPLAY_NAME% credentials." in content
  assert "--live-cloud requires authenticated GCP credentials." in content
  assert "--live-cloud requires authenticated AWS credentials." in content


def test_env_isolation_and_libscript_config_consistency() -> None:
  """Verify .env holds service/cloud/OS specifics and libscript.json/scripts never hardcode them."""
  env_cfg = load_repo_env()
  service_user = env_cfg.get("SERVICE_USER", "")
  assert service_user, "SERVICE_USER must be defined in .env"
  assert env_cfg.get("DATA_MOUNT_DIR"), "DATA_MOUNT_DIR must be defined in .env"
  assert env_cfg.get("DUCKDB_PATH"), "DUCKDB_PATH must be defined in .env"
  assert env_cfg.get("DEFAULT_CLOUD_PROVIDER"), "DEFAULT_CLOUD_PROVIDER must be defined in .env"

  # Secrets must be separated into .env.secrets / .env.secrets.tpl and ignored by git
  assert ENV_SECRETS_TPL_PATH.is_file(), ".env.secrets.tpl must exist at repo root"
  secrets_tpl_cfg = _parse_env_file(ENV_SECRETS_TPL_PATH)
  for secret_key in ("SECRET_KEY", "POSTGRES_PASSWORD", "OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"):
    assert secret_key not in env_cfg, f"{secret_key} must not be stored in .env; use .env.secrets"
    assert secret_key in secrets_tpl_cfg, f"{secret_key} must be documented in .env.secrets.tpl"
  gitignore_lines = [line.strip() for line in GITIGNORE_PATH.read_text(encoding="utf-8").splitlines()]
  assert ".env.secrets" in gitignore_lines, ".env.secrets must be listed in .gitignore"

  # Ensure SERVICE_USER and platform-specific literals never appear outside .env
  checked_files = [
    REPO_ROOT / "libscript.json",
    REPO_ROOT / "test.sh",
    REPO_ROOT / "test.cmd",
    REPO_ROOT / "DEPLOY.md",
  ]
  for file_path in checked_files:
    file_text = file_path.read_text(encoding="utf-8")
    assert service_user not in file_text, f"Service user literal found outside .env in {file_path.name}"
    assert env_cfg["DATA_MOUNT_DIR"] not in file_text, f"DATA_MOUNT_DIR literal found in {file_path.name}"
    assert env_cfg["VM_OS_IMAGE"] not in file_text, f"VM_OS_IMAGE literal found in {file_path.name}"
    assert env_cfg["INIT_SYSTEM"] not in file_text, f"INIT_SYSTEM literal found in {file_path.name}"

  libscript_json_path = REPO_ROOT / "libscript.json"
  config = json.loads(libscript_json_path.read_text(encoding="utf-8"))
  assert config["$schema"].endswith("libscript.schema.json")
  required = config["dependencies"]["required"]

  db_names = [d["name"] for d in required.get("databases", [])]
  server_names = [s["name"] for s in required.get("servers", [])]
  toolchain_names = [t["name"] for t in required.get("toolchains", [])]
  runtime_names = [r["name"] for r in config["dependencies"].get("runtime", [])]
  build_names = [b["name"] for b in config["dependencies"].get("build", [])]

  assert "postgres" in db_names
  assert "duckdb" in db_names
  assert "nginx" in server_names
  assert "ollama" in server_names
  assert "nodejs" in toolchain_names
  assert "python" in toolchain_names
  assert "uv" in toolchain_names
  assert {"python", "nodejs", "postgres", "duckdb", "nginx", "ollama"}.issubset(runtime_names)
  assert "uv" in build_names

  # Declarative databases and frontends (Angular + KMP)
  db_engines = {d["engine"]: d for d in config["databases"]}
  assert db_engines["postgres"]["name"] == "pulse_query_db"
  assert db_engines["postgres"]["min_tables"] == 2
  assert db_engines["postgres"]["required_tables"] == ["templates", "alembic_version"]
  assert db_engines["duckdb"]["path"] == "${DUCKDB_PATH}"
  assert db_engines["duckdb"]["min_tables"] == 2
  assert db_engines["duckdb"]["required_tables"] == ["hospital_data", "Synthetic_hospital_data_transfers"]
  assert config["frontends"]["web"]["framework"] == "angular"
  assert config["frontends"]["web"]["source_dir"] == "pulse-query-ng-web"
  assert config["frontends"]["kmp"]["framework"] == "kmp"
  assert config["frontends"]["kmp"]["source_dir"] == "PulseQuery"

  # Also check top-level deps, services, hooks, ingress, and ml
  assert config["deps"]["python"] == "3.12"
  assert config["deps"]["nodejs"] == "22"
  assert config["deps"]["postgres"] == "18"
  assert len(config["services"]) == 1
  svc = config["services"][0]
  assert svc["name"] == "pulse-query-backend"
  assert svc["working_dir"] == "pulse-query-backend"
  assert svc["port"] == 8000
  assert svc["user"] == "${SERVICE_USER}"
  assert svc["env"] == svc["environment"]
  assert svc["health_check"]["url"] == "http://127.0.0.1:8000/api/v1/system/health"
  assert svc["health_check"]["expect_status"] == 200
  assert '.datasets.status == "ready"' in svc["health_check"]["expect_json"]
  assert ".templates.template_count >= 10" in svc["health_check"]["expect_json"]
  for hook_phase in ("pre_install", "install", "post_install", "build", "db_migrate", "pre_start", "health"):
    assert hook_phase in config["hooks"]
    assert hook_phase in config["infrastructure"]["hooks"]
    for hook in config["hooks"][hook_phase]:
      assert "name" in hook
      assert "command" in hook

  # Verify working_dir and cmd_windows on cross-platform hooks
  install_hooks = {h["name"]: h for h in config["hooks"]["install"]}
  assert install_hooks["install-backend-deps"]["working_dir"] == "pulse-query-backend"
  assert "cmd_windows" in install_hooks["install-backend-deps"]
  assert install_hooks["install-frontend-deps"]["working_dir"] == "pulse-query-ng-web"
  assert "cmd_windows" in install_hooks["install-frontend-deps"]

  migrate_hooks = {h["name"]: h for h in config["hooks"]["db_migrate"]}
  assert migrate_hooks["alembic-upgrade-head"]["working_dir"] == "pulse-query-backend"
  assert migrate_hooks["ingest-clinical-datasets"]["working_dir"] == "pulse-query-backend"
  assert "hospital_analytics.duckdb" in migrate_hooks["ingest-clinical-datasets"]["cmd_windows"]
  assert migrate_hooks["seed-dashboard-templates"]["working_dir"] == "pulse-query-backend"
  assert "hospital_analytics.duckdb" in migrate_hooks["seed-dashboard-templates"]["cmd_windows"]
  assert "fix-data-directory-ownership" in migrate_hooks
  assert "${SERVICE_USER" in migrate_hooks["fix-data-directory-ownership"]["command"]

  ingress = config["ingress"]
  assert ingress == config["infrastructure"]["network"]["ingress"]
  assert ingress["provider"] == "nginx"
  assert ingress["domain"] == "pulse-query.healthplatform.io"
  assert ingress["routes"]["/api"]["proxy"] == "http://127.0.0.1:8000"
  assert ingress["routes"]["/ws"]["ws"] == "ws://127.0.0.1:8000"
  assert ingress["routes"]["/"]["spa"] is True

  assert config["ml"]["backend"] == "jax"
  assert "run_benchmark.py" in config["ml"]["train_command"]
  assert "train_tpu_optimization_llm.py" in config["ml"]["train_command"]
  assert "evaluate_optimization_models.py" in config["ml"]["infer_command"]

  deploy_md = (REPO_ROOT / "DEPLOY.md").read_text(encoding="utf-8")
  assert "libscript.sh install-deps libscript.json" in deploy_md
  assert "libscript.sh start libscript.json" in deploy_md
  assert "libscript.sh stop libscript.json" in deploy_md
  assert "libscript.sh train libscript.json" in deploy_md
  assert "libscript.sh infer libscript.json" in deploy_md
  assert "libscript.sh install android-sdk latest" in deploy_md
  assert "provision_frontend.sh" in deploy_md
  assert "netctl/cli.sh apply libscript.json" in deploy_md
  assert "libscript.sh deprovision aws" in deploy_md
  assert 'libscript.sh deprovision "$CLOUD_PROVIDER"' in deploy_md
  assert "libscript.sh deprovision gcp" in deploy_md
  assert "libscript.sh cloud deprovision" not in deploy_md
  assert "libscript.sh cloud aws storage create" in deploy_md
  assert 'libscript.sh cloud "$CLOUD_PROVIDER" storage create' in deploy_md
  assert "libscript.sh cloud gcp storage create" in deploy_md
  assert "./test.sh --unit-mock" in deploy_md
  assert "./test.sh --live-cloud" in deploy_md

  readme_md = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
  assert "libscript.sh install-deps libscript.json" in readme_md
  assert "libscript.sh train libscript.json" in readme_md
  assert "libscript.sh infer libscript.json" in readme_md

  mpax_md = (REPO_ROOT / "MPAX.md").read_text(encoding="utf-8")
  assert "libscript.sh train libscript.json" in mpax_md
  assert "libscript.sh infer libscript.json" in mpax_md

  makefile_content = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")
  make_bat_content = (REPO_ROOT / "make.bat").read_text(encoding="utf-8")
  expected_targets = (
    "help",
    "setup",
    "setup_native",
    "run_native",
    "test_native",
    "clean_native",
    "setup_docker",
    "build_docker",
    "run_docker",
    "test_docker",
    "clean_docker",
    "db_docker",
    "migrate_docker",
    "seed_docker",
    "setup_db_docker",
    "backend_docker",
    "frontend_docker",
    "install_base",
    "install_deps",
    "install_db",
    "init_db",
    "migrate_db",
    "seed_db",
    "setup_db",
    "setup_backend",
    "build_backend",
    "dev_backend",
    "setup_frontend",
    "generate_client",
    "build_frontend",
    "dev_frontend",
    "build_docs",
    "build",
    "serve",
    "start_stack",
    "stop_stack",
    "status_stack",
    "health_stack",
    "logs_stack",
    "train_ml",
    "infer_ml",
    "test",
    "fmt",
  )
  for target in expected_targets:
    assert f"{target}:" in makefile_content, f"Missing target '{target}:' in Makefile"
    assert f":{target}" in make_bat_content, f"Missing label ':{target}' in make.bat"
    assert f'if "%~1"=="{target}" goto {target}' in make_bat_content, f"Missing dispatch for '{target}' in make.bat"


def test_makefile_dry_run_and_docker_compose_integrity() -> None:
  """Verify `make help` and `make -n <target>` succeed for all targets and validate docker-compose files."""
  res_help = subprocess.run(
    ["make", "help"],
    cwd=str(REPO_ROOT),
    capture_output=True,
    text=True,
    check=False,
  )
  assert res_help.returncode == 0
  assert "setup_native" in res_help.stdout
  assert "setup_docker" in res_help.stdout
  assert "setup_db" in res_help.stdout
  assert "setup_backend" in res_help.stdout
  assert "setup_frontend" in res_help.stdout

  for target in (
    "setup",
    "setup_native",
    "run_native",
    "test_native",
    "clean_native",
    "setup_docker",
    "build_docker",
    "run_docker",
    "test_docker",
    "clean_docker",
    "db_docker",
    "migrate_docker",
    "seed_docker",
    "setup_db_docker",
    "backend_docker",
    "frontend_docker",
    "install_base",
    "install_deps",
    "install_db",
    "init_db",
    "migrate_db",
    "seed_db",
    "setup_db",
    "setup_backend",
    "build_backend",
    "dev_backend",
    "setup_frontend",
    "generate_client",
    "build_frontend",
    "dev_frontend",
    "build_docs",
    "build",
    "serve",
    "start_stack",
    "stop_stack",
    "status_stack",
    "health_stack",
    "logs_stack",
    "train_ml",
    "infer_ml",
    "test",
    "fmt",
  ):
    res_dry = subprocess.run(
      ["make", "-n", target],
      cwd=str(REPO_ROOT),
      capture_output=True,
      text=True,
      check=False,
    )
    assert res_dry.returncode == 0, f"make -n {target} failed: {res_dry.stderr}"

  root_compose = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
  backend_compose = (REPO_ROOT / "pulse-query-backend" / "docker-compose.yml").read_text(encoding="utf-8")
  for compose_text in (root_compose, backend_compose):
    assert "pg_isready -U postgres -d pulse_query_db" in compose_text
    assert "postgres_data:/var/lib/postgresql/data" in compose_text
    assert "duckdb_data:/var/lib/pulse-query" in compose_text
    assert "condition: service_healthy" in compose_text
    assert "USE_SQLITE_ALEMBIC=${USE_SQLITE_ALEMBIC:-0}" in compose_text
  assert "frontend:" in root_compose

  readme_text = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
  assert "### `Makefile` & `make.bat` Usage Guide" in readme_text
  assert "#### Complete Target Reference Table" in readme_text
  assert "#### Configurable Makefile Variables" in readme_text
  for target in (
    "setup_native",
    "setup_docker",
    "setup_db",
    "setup_db_docker",
    "setup_backend",
    "backend_docker",
    "setup_frontend",
    "frontend_docker",
  ):
    assert f"`{target}`" in readme_text, f"Missing `{target}` in README.md usage table"
