"""
Unit and branch coverage tests for `error_classifier`, `gemma4_sql_provider`, `health_probe`,
and the new `/api/v1/ai/health`, `/api/v1/ai/models/verify`, and direct SQL chat execution flows.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import uuid

from httpx import AsyncClient
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import Settings, settings
from app.core.result import AppError, Err, ErrorCode, Ok
from app.main import app
from app.models.chat import Conversation
from app.models.user import User
from app.schemas.admin import AdminSettingsResponse
from app.schemas.ai import LlmConnectionTestRequest, ModelInfo, SQLExecutionResponse
from app.schemas.json_types import JsonValue
from app.services.chat_service import ChatService, execute_readonly_duckdb_preview
from app.services.llm.discovery import _infer_processor_type, _parse_configured_model_entry
from app.services.llm.error_classifier import classify_llm_error, format_classified_error_markdown
from app.services.llm.gemma4_sql_provider import (
  DuckDBUdfConnProtocol,
  Gemma4SqlCompletionChunk,
  Gemma4SqlDuckDbExtensionProtocol,
  Gemma4SqlInferenceModuleProtocol,
  Gemma4SqlProvider,
  _load_gemma4_sql_duckdb_module,
  _load_gemma4_sql_inference_module,
  extract_clean_sql,
  register_gemma4_duckdb_udf,
  synthesize_schema_aware_duckdb_sql,
)
from app.services.llm.health_probe import (
  _map_error_code_to_status,
  check_duckdb_readonly_ready,
  probe_all_configured_models_result,
  probe_any_llm_provider_health_result,
  probe_connection_request_result,
  probe_gemma4_sql_health_result,
  probe_ollama_health_result,
)
from app.services.llm_client import ArenaResponse, LLMArenaClient


def test_classify_llm_error_all_branches() -> None:
  """Verifies `classify_llm_error` and `format_classified_error_markdown` across all error categories."""
  # 1. Segfault / llama-server crash
  err_crash = classify_llm_error(
    "ollama",
    "llama3",
    "Error code: 500 - {'error': {'message': 'llama-server process has terminated: signal: segmentation fault (core dumped)'}}",
  )
  assert err_crash.code == ErrorCode.LLM_LOCAL_PROCESS_CRASHED
  assert err_crash.status_code == 502
  md_crash = format_classified_error_markdown(err_crash)
  assert "LLM_LOCAL_PROCESS_CRASHED" in md_crash
  assert "**Remediation:**" in md_crash

  # 2. Connection refused / timeout / Connection error. + double-wrap prevention
  err_conn = classify_llm_error("ollama", "qwen2.5", RuntimeError("All connection attempts failed"))
  assert err_conn.code == ErrorCode.LLM_CONNECTION_REFUSED
  assert err_conn.status_code == 503

  err_conn_dot = classify_llm_error("ollama", "gemma4:latest", Exception("Connection error."))
  assert err_conn_dot.code == ErrorCode.LLM_CONNECTION_REFUSED
  assert err_conn_dot.status_code == 503

  err_unwrapped = classify_llm_error(
    "gemma4:latest (ollama)",
    "ollama:gemma4:latest",
    "Error: Provider 'gemma4:latest (ollama)' (ollama:gemma4:latest) error: Provider 'ollama' (gemma4:latest) error: Connection error. | Remediation: Restart Ollama",
  )
  assert err_unwrapped.code == ErrorCode.LLM_CONNECTION_REFUSED
  assert "Provider 'gemma4:latest (ollama)'" not in err_unwrapped.message
  assert err_unwrapped.message == (
    "Cannot connect to provider 'gemma4:latest (ollama)' for model 'ollama:gemma4:latest': Connection error."
  )

  # 3. Auth invalid (401/403)
  err_auth = classify_llm_error("gemini", "gemini-2.5-pro", "401 Unauthorized: API_KEY_INVALID")
  assert err_auth.code == ErrorCode.LLM_AUTH_INVALID
  assert err_auth.status_code == 401

  # 4. Model not found (404)
  err_404 = classify_llm_error("ollama", "ollama:missing-tag", "404 model not found, try pulling it first")
  assert err_404.code == ErrorCode.LLM_MODEL_NOT_FOUND
  assert err_404.status_code == 404

  # 5. Quota / rate limit (429)
  err_429 = classify_llm_error("openai", "gpt-4o", "429 Rate limit reached / insufficient_quota")
  assert err_429.code == ErrorCode.LLM_QUOTA_EXCEEDED
  assert err_429.status_code == 429

  # 6. Generic fallback + empty exception message + empty string + empty remediation markdown branch
  err_gen = classify_llm_error("", "", RuntimeError(""))
  assert err_gen.code == ErrorCode.LLM_PROVIDER_ERROR
  assert err_gen.details["provider"] == "llm"
  assert err_gen.details["model"] == "unknown"

  err_empty_str = classify_llm_error("openai", "gpt-4o", "   ")
  assert "Unknown" in err_empty_str.message

  err_no_rem = AppError(
    code=ErrorCode.LLM_PROVIDER_ERROR,
    message="unexpected failure",
    status_code=502,
    details={},
  )
  md_no_rem = format_classified_error_markdown(err_no_rem)
  assert "**Remediation:**" not in md_no_rem


def test_discovery_and_config_gemma4_sql_branches() -> None:
  """Verifies `_parse_configured_model_entry`, `_infer_processor_type`, and `Settings.LLM_SWARM` with `GEMMA4_SQL_ENABLED`."""
  assert _parse_configured_model_entry("gemma-4-sql:google/gemma-4-sql-9b|Gemma SQL") == (
    "gemma4sql",
    "google/gemma-4-sql-9b",
    "Gemma SQL",
  )
  assert _parse_configured_model_entry("google:gemini-2.5-flash") == (
    "gemini",
    "gemini-2.5-flash",
    "gemini-2.5-flash (gemini)",
  )
  assert _infer_processor_type("gemma4sql", "gemma4sql:google/gemma-4-sql-9b", True) == "GEMMA_4_SQL"
  assert _infer_processor_type("gemini", "gemini:gemini-2.5-pro", False) == "GEMINI"

  from app.schemas.ai import ModelInfo
  from app.services.llm.discovery import (
    DEFAULT_CHOICE_OLLAMA_MODELS,
    _matches_visible_filter,
    _ollama_model_sort_key,
    assemble_available_models,
    normalize_ollama_tag_key,
    resolve_ollama_model_alias,
  )

  assert resolve_ollama_model_alias("ollama:hf.co/google/gemma-4-E4B") == "gemma:2b"
  assert resolve_ollama_model_alias("ollama:gemma4:latest") == "gemma:2b"
  assert resolve_ollama_model_alias("gemma:latest") == "gemma:2b"
  assert resolve_ollama_model_alias("hf.co/microsoft/Phi-4-mini-flash-reasoning") == "phi4-mini"
  assert resolve_ollama_model_alias("hf.co/meta-llama/Llama-3.2-1B") == "llama3.2:1b"
  assert normalize_ollama_tag_key("ollama:gemma4:latest") == "gemma:2b"
  assert normalize_ollama_tag_key("ollama:llama3:latest") == "llama3"
  assert _parse_configured_model_entry("/mnt/data/ollama_models") is None
  assert _parse_configured_model_entry("ollama:/mnt/data/ollama_models") is None
  assert _parse_configured_model_entry("ollama:hf.co/google/gemma-4-E4B|Gemma 4 E4B") == (
    "ollama",
    "gemma:2b",
    "Gemma 4 E4B",
  )

  heavy_model = ModelInfo(id="ollama:gemma2:27b", name="Gemma 27B", provider="ollama", is_local=True)
  std_model = ModelInfo(id="ollama:llama3:8b", name="Llama 8B", provider="ollama", is_local=True)
  light_model = ModelInfo(id="ollama:gemma:2b", name="Gemma 2B", provider="ollama", is_local=True)
  assert _ollama_model_sort_key(light_model) < _ollama_model_sort_key(std_model) < _ollama_model_sort_key(heavy_model)

  assert _matches_visible_filter("ollama:gemma:2b", {"ollama:hf.co/google/gemma-4-E4B"}) is True
  assert _matches_visible_filter("ollama:gemma:2b", {"gemma4:latest"}) is True
  assert _matches_visible_filter("ollama:phi4-mini", {"ollama:hf.co/google/gemma-4-E4B"}) is False

  # When discovered_ollama is non-empty, unpulled choice models and unconfigured cloud models are filtered out when show_all=False
  models_with_choice = assemble_available_models(
    swarm_entries=[
      {"id": "/mnt/data/ollama_models", "name": "Invalid Path", "provider": "ollama", "is_local": True},
      {"id": "ollama:hf.co/google/gemma-4-E4B", "name": "Legacy Alias", "provider": "ollama", "is_local": True},
      {"id": "ollama:unpulled-tag", "name": "Unpulled Tag", "provider": "ollama", "is_local": True},
      {"id": "gemma4sql:google/gemma-4-sql-9b", "name": "Gemma SQL", "provider": "gemma4sql", "is_local": True},
      {"id": "openai:gpt-4o", "name": "GPT-4o", "provider": "openai", "is_local": False},
      {"id": "gemini:gemini-2.5-flash", "name": "Gemini", "provider": "gemini", "is_local": False},
    ],
    admin_settings=AdminSettingsResponse(
      api_keys={"google": "g-key"},
      configured_models=["ollama:missing-extra", "anthropic:claude-3", "gemma4sql:google/gemma-4-sql-2b"],
      gemma4_sql_enabled=False,
    ),
    include_sql=True,
    discovered_ollama=[heavy_model, DEFAULT_CHOICE_OLLAMA_MODELS[0], std_model],
    show_all=False,
  )
  ids = [m.id for m in models_with_choice]
  assert ids[0] == "SQL"
  assert ids[1] == "ollama:gemma:2b"
  assert "ollama:phi4-mini" not in ids
  assert "ollama:unpulled-tag" not in ids
  assert "ollama:missing-extra" not in ids
  assert "openai:gpt-4o" not in ids
  assert "anthropic:claude-3" not in ids
  assert "gemma4sql:google/gemma-4-sql-9b" not in ids
  assert "gemini:gemini-2.5-flash" in ids
  assert ids.index("ollama:gemma:2b") < ids.index("ollama:llama3:8b") < ids.index("ollama:gemma2:27b")

  # When show_all=True, unpulled Ollama and unconfigured cloud/gemma4sql models are included with error/unconfigured status
  models_show_all = assemble_available_models(
    swarm_entries=[
      {"id": "ollama:unpulled-tag", "name": "Unpulled Tag", "provider": "ollama", "is_local": True},
      {"id": "gemma4sql:google/gemma-4-sql-9b", "name": "Gemma SQL", "provider": "gemma4sql", "is_local": True},
      {"id": "openai:gpt-4o", "name": "GPT-4o", "provider": "openai", "is_local": False},
    ],
    admin_settings=AdminSettingsResponse(
      api_keys={},
      configured_models=["ollama:missing-extra", "anthropic:claude-3"],
      gemma4_sql_enabled=False,
    ),
    include_sql=True,
    discovered_ollama=[DEFAULT_CHOICE_OLLAMA_MODELS[0]],
    show_all=True,
  )
  status_by_id = {m.id: m.status for m in models_show_all}
  assert status_by_id["ollama:unpulled-tag"] == "error"
  assert status_by_id["ollama:missing-extra"] == "error"
  assert status_by_id["gemma4sql:google/gemma-4-sql-9b"] == "unconfigured"
  assert status_by_id["openai:gpt-4o"] == "unconfigured"
  assert status_by_id["anthropic:claude-3"] == "unconfigured"

  # When visible_models in admin_settings contains only stale/uninstalled IDs, fallback to all live discovered models
  models_stale_visible = assemble_available_models(
    swarm_entries=[],
    admin_settings=AdminSettingsResponse(visible_models=["ollama:deleted-model:70b"]),
    include_sql=True,
    discovered_ollama=[DEFAULT_CHOICE_OLLAMA_MODELS[0]],
  )
  assert "ollama:gemma:2b" in [m.id for m in models_stale_visible]

  # When discovered_ollama is None, all DEFAULT_CHOICE_OLLAMA_MODELS are included as default catalog
  models_default_catalog = assemble_available_models(
    swarm_entries=[],
    admin_settings=None,
    include_sql=True,
    discovered_ollama=None,
  )
  default_ids = [m.id for m in models_default_catalog]
  assert "ollama:gemma:2b" in default_ids
  assert "ollama:phi4-mini" in default_ids
  assert "ollama:llama3.2:1b" in default_ids

  # Choice models filtered when admin_settings.visible_models excludes them
  models_filtered = assemble_available_models(
    swarm_entries=[],
    admin_settings=AdminSettingsResponse(visible_models=["SQL"]),
    include_sql=True,
  )
  assert [m.id for m in models_filtered] == ["SQL"]

  s_enabled = Settings(
    GEMMA4_SQL_ENABLED=True,
    GEMMA4_SQL_BACKEND="mlx",
    GEMMA4_SQL_MODEL_NAME="google/gemma-4-sql-9b",
    OPENAI_API_KEY=None,
    MISTRAL_API_KEY=None,
    ANTHROPIC_API_KEY=None,
    GEMINI_API_KEY=None,
    GOOGLE_API_KEY=None,
    LLM_LOCAL_MODELS="",
    OLLAMA_MODELS="",
  )
  swarm = s_enabled.LLM_SWARM
  assert any(item["provider"] == "gemma4sql" for item in swarm)


def test_gemma4_sql_provider_all_modes_and_helpers() -> None:
  """Verifies `Gemma4SqlProvider`, `extract_clean_sql`, `synthesize_schema_aware_duckdb_sql`, and UDF registration."""
  nl = chr(10)
  # 1. CompletionChunk wrappers
  chunk = Gemma4SqlCompletionChunk(f"```sql{nl}SELECT 1;{nl}```")
  assert len(chunk.choices) == 1
  assert chunk.choices[0].message.content == f"```sql{nl}SELECT 1;{nl}```"

  # 2. extract_clean_sql with fence and without semicolon
  assert extract_clean_sql(f"```sql{nl}SELECT * FROM hospital_data{nl}```") == "SELECT * FROM hospital_data;"
  assert extract_clean_sql("SELECT 1;") == "SELECT 1;"

  # 3. synthesize_schema_aware_duckdb_sql branches
  assert "GROUP BY Hospital_Service" in synthesize_schema_aware_duckdb_sql("How many patients per service?")
  assert "COUNT(*) AS total_records" in synthesize_schema_aware_duckdb_sql("Count total records")
  assert "avg_length_of_stay" in synthesize_schema_aware_duckdb_sql("Show average length of stay")
  assert "Synthetic_hospital_data_transfers" in synthesize_schema_aware_duckdb_sql("Show transfers", "transfers")
  assert synthesize_schema_aware_duckdb_sql("General summary") == "SELECT * FROM hospital_data LIMIT 25;"

  # 4. Dynamic module loaders when installed vs not installed
  with patch("app.services.llm.gemma4_sql_provider.importlib.import_module", side_effect=ImportError("no pkg")):
    assert _load_gemma4_sql_inference_module() is None
    assert _load_gemma4_sql_duckdb_module() is None

  class _ValidInferenceMod:
    """Stub module conforming to `Gemma4SqlInferenceModuleProtocol`."""

    def generate_sql(
      self,
      model_name: str,
      prompt: str,
      beam_width: int = 3,
      max_length: int = 50,
      backend: str = "mlx",
      **kwargs: JsonValue,
    ) -> dict[str, JsonValue]:
      """Returns deterministic SQL dictionary."""
      _ = (model_name, prompt, beam_width, max_length, backend, kwargs)
      return {"sql": f"```sql{chr(10)}SELECT 99 FROM hospital_data{chr(10)}```", "confidence": 0.98, "status": "ok"}

  class _ValidDuckMod:
    """Stub module conforming to `Gemma4SqlDuckDbExtensionProtocol`."""

    def embed_in_duckdb(
      self,
      duck_conn: DuckDBUdfConnProtocol | None,
      model_name: str = "google/gemma-4-sql-9b",
      backend: str = "mlx",
      ddl: str = "",
    ) -> None:
      """No-op UDF registration."""
      _ = (duck_conn, model_name, backend, ddl)

  class _EmptyStub:
    """Non-conforming stub class."""

  valid_inf = _ValidInferenceMod()
  valid_duck = _ValidDuckMod()
  assert isinstance(valid_inf, Gemma4SqlInferenceModuleProtocol)
  assert isinstance(valid_duck, Gemma4SqlDuckDbExtensionProtocol)

  with patch("app.services.llm.gemma4_sql_provider.importlib.import_module", return_value=valid_inf):
    assert _load_gemma4_sql_inference_module() is valid_inf

  with patch("app.services.llm.gemma4_sql_provider.importlib.import_module", return_value=_EmptyStub()):
    assert _load_gemma4_sql_inference_module() is None
    assert _load_gemma4_sql_duckdb_module() is None

  with patch("app.services.llm.gemma4_sql_provider.importlib.import_module", return_value=valid_duck):
    assert _load_gemma4_sql_duckdb_module() is valid_duck
    udf_res_ext = register_gemma4_duckdb_udf(None, model_name="m", backend="mlx", ddl="CREATE TABLE t (id INT);")
    assert isinstance(udf_res_ext, Ok)

  # 5. register_gemma4_duckdb_udf fallback and error branches
  from collections.abc import Callable

  with patch("app.services.llm.gemma4_sql_provider._load_gemma4_sql_duckdb_module", return_value=None):
    res_no_fn = register_gemma4_duckdb_udf(None)
    assert isinstance(res_no_fn, Err)

    registered_fns: dict[str, Callable[[str], str]] = {}

    class _FakeConn:
      """Stub DuckDB connection capturing registered UDFs."""

      def create_function(self, name: str, function: Callable[[str], str]) -> None:
        """Stores UDF callback."""
        registered_fns[name] = function

    res_ok = register_gemma4_duckdb_udf(_FakeConn(), ddl="CREATE TABLE hospital_data (id INT);")
    assert isinstance(res_ok, Ok)
    udf_cb = registered_fns["ask_gemma"]
    out_json = str(udf_cb("Count patients"))
    assert "generated_sql" in out_json

    class _BrokenConn:
      """Stub DuckDB connection raising on `create_function`."""

      def create_function(self, name: str, function: Callable[[str], str]) -> None:
        """Raises RuntimeError."""
        _ = (name, function)
        raise RuntimeError("cannot register")

    res_broken = register_gemma4_duckdb_udf(_BrokenConn())
    assert isinstance(res_broken, Err)

  # 6. Gemma4SqlProvider.generate_sql_sync: remote API, SDK module, and fallback synthesizer
  provider_remote = Gemma4SqlProvider(api_base="http://localhost:8080/", show_confidence=False)
  with patch("app.services.llm.gemma4_sql_provider.httpx.Client") as mock_http_cls:
    mock_http_inst = MagicMock()
    mock_http_cls.return_value.__enter__.return_value = mock_http_inst
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"sql": "SELECT 1", "confidence": "not-a-float"}
    mock_http_inst.post.return_value = mock_resp

    res_rem = provider_remote.generate_sql_sync("Count rows", schema_context="CREATE TABLE t (id INT);")
    assert res_rem["sql"] == "SELECT 1;"
    assert res_rem["confidence"] == 0.96
    md_no_conf = provider_remote.format_markdown_response(res_rem)
    assert "confidence:" not in md_no_conf

    mock_resp.json.return_value = {"sql": "   "}
    with pytest.raises(ValueError, match="empty SQL"):
      provider_remote.generate_sql_sync("Count rows")

  provider_sdk = Gemma4SqlProvider(backend="mlx", show_confidence=True)
  with patch("app.services.llm.gemma4_sql_provider._load_gemma4_sql_inference_module", return_value=valid_inf):
    res_sdk = provider_sdk.generate_sql_sync("Count rows")
    assert res_sdk["sql"] == "SELECT 99 FROM hospital_data;"
    md_with_conf = provider_sdk.format_markdown_response(res_sdk)
    assert "confidence: 98.0%" in md_with_conf

  class _PlaceholderSdkMod:
    """Stub SDK module returning generic placeholder SQL that triggers schema synthesis."""

    def generate_sql(
      self,
      model_name: str,
      prompt: str,
      beam_width: int = 3,
      max_length: int = 50,
      backend: str = "mlx",
      **kwargs: JsonValue,
    ) -> dict[str, JsonValue]:
      """Returns generic placeholder SQL."""
      _ = (model_name, prompt, beam_width, max_length, backend, kwargs)
      return {"sql": "SELECT * FROM table WHERE condition = 'Prompt'"}

  with patch(
    "app.services.llm.gemma4_sql_provider._load_gemma4_sql_inference_module",
    return_value=_PlaceholderSdkMod(),
  ):
    res_synth = provider_sdk.generate_sql_sync("Count patients")
    assert res_synth["status"] == "success_mlx_synthesized"

  comp_res = provider_sdk.completion(
    model="google/gemma-4-sql-9b",
    messages=[{"role": "system", "content": "Schema"}, {"role": "user", "content": "Count patients"}],
  )
  assert "SELECT" in (comp_res.choices[0].message.content or "")

  comp_empty = provider_sdk.completion(model="google/gemma-4-sql-9b", messages=[])
  assert "SELECT" in (comp_empty.choices[0].message.content or "")


@pytest.mark.asyncio
async def test_health_probe_and_llm_client_gemma4_branches(monkeypatch: pytest.MonkeyPatch) -> None:
  """Verifies `health_probe.py` and `LLMArenaClient` Gemma-4-SQL / dynamic combatant branches."""
  assert _map_error_code_to_status(str(ErrorCode.LLM_LOCAL_PROCESS_CRASHED)) == "crashed"
  assert _map_error_code_to_status(str(ErrorCode.LLM_AUTH_INVALID)) == "auth_error"
  assert _map_error_code_to_status(str(ErrorCode.LLM_CONNECTION_REFUSED)) == "offline"
  assert _map_error_code_to_status(str(ErrorCode.LLM_MODEL_NOT_FOUND)) == "degraded"
  assert _map_error_code_to_status(str(ErrorCode.LLM_PROVIDER_ERROR)) == "error"

  # DuckDB readiness check: success and exception branch
  fake_duck_conn = MagicMock()
  fake_duck_conn.execute.return_value.fetchone.return_value = (1,)
  with patch(
    "app.services.llm.health_probe.duckdb_manager.get_readonly_connection",
    return_value=fake_duck_conn,
  ):
    assert check_duckdb_readonly_ready() is True
  fake_duck_conn.close.assert_called_once()

  with patch(
    "app.services.llm.health_probe.duckdb_manager.get_readonly_connection",
    side_effect=RuntimeError("duckdb locked"),
  ):
    assert check_duckdb_readonly_ready() is False

  # 1. probe_ollama_health_result branches
  mock_http = AsyncMock()
  resp_500 = MagicMock(status_code=500, text="llama-server process has terminated: signal: segmentation fault")
  mock_http.get.return_value = resp_500
  res_500 = await probe_ollama_health_result(model_name="llama3", http_client=mock_http)
  assert isinstance(res_500, Ok)
  assert res_500.value.status == "crashed"

  resp_tags = MagicMock(status_code=200)
  resp_tags.json.return_value = {"models": [{"name": "qwen2.5:latest"}]}
  mock_http.get.return_value = resp_tags
  res_missing = await probe_ollama_health_result(model_name="codellama:7b", http_client=mock_http)
  assert isinstance(res_missing, Ok)
  assert res_missing.value.status == "degraded"

  resp_tags.json.return_value = {"models": [{"name": "llama3:latest"}, {"name": "gemma4"}, {"name": "gemma:2b"}]}
  res_no_smoke_ok = await probe_ollama_health_result(
    model_name="llama3",
    run_smoke_test=False,
    http_client=mock_http,
  )
  assert isinstance(res_no_smoke_ok, Ok)
  assert res_no_smoke_ok.value.status == "connected"

  res_latest_norm = await probe_ollama_health_result(
    model_name="gemma4:latest",
    run_smoke_test=False,
    http_client=mock_http,
  )
  assert isinstance(res_latest_norm, Ok)
  assert res_latest_norm.value.status == "connected"

  res_slash_norm = await probe_ollama_health_result(
    model_name="ollama/gemma:2b",
    run_smoke_test=False,
    http_client=mock_http,
  )
  assert isinstance(res_slash_norm, Ok)
  assert res_slash_norm.value.status == "connected"

  from app.services.llm.discovery import discover_ollama_models_result

  resp_tags_with_path = MagicMock(status_code=200)
  resp_tags_with_path.json.return_value = {
    "models": [
      {"name": "/mnt/data/ollama_models"},
      {"name": "gemma2:27b"},
      {"name": "gemma:2b"},
    ]
  }
  mock_http.get.return_value = resp_tags_with_path
  disc_res = await discover_ollama_models_result(http_client=mock_http)
  assert isinstance(disc_res, Ok)
  assert [m.id for m in disc_res.value] == ["ollama:gemma:2b", "ollama:gemma2:27b"]
  mock_http.get.return_value = resp_tags

  mock_http.post.return_value = MagicMock(status_code=200, text="{}")
  res_smoke_ok = await probe_ollama_health_result(
    model_name="llama3",
    run_smoke_test=True,
    http_client=mock_http,
  )
  assert isinstance(res_smoke_ok, Ok)
  assert res_smoke_ok.value.status == "connected"

  mock_http.post.return_value = MagicMock(
    status_code=500,
    text="llama-server process has terminated: signal: segmentation fault (core dumped)",
  )
  res_smoke_crash = await probe_ollama_health_result(
    model_name="llama3",
    run_smoke_test=True,
    http_client=mock_http,
  )
  assert isinstance(res_smoke_crash, Ok)
  assert res_smoke_crash.value.status == "crashed"

  with patch("app.services.llm.health_probe.httpx.AsyncClient") as mock_ac_cls:
    owned_ac = AsyncMock()
    owned_ac.get.side_effect = RuntimeError("Connection refused")
    mock_ac_cls.return_value = owned_ac
    res_conn_err = await probe_ollama_health_result(model_name="llama3")
    assert isinstance(res_conn_err, Ok)
    assert res_conn_err.value.status == "offline"
    owned_ac.aclose.assert_awaited_once()

  # 2. probe_gemma4_sql_health_result branches
  res_bad_backend = await probe_gemma4_sql_health_result(backend="invalid_engine")
  assert isinstance(res_bad_backend, Ok)
  assert res_bad_backend.value.status == "error"

  res_gemma_fast = await probe_gemma4_sql_health_result(backend="mlx", run_smoke_test=False)
  assert isinstance(res_gemma_fast, Ok)
  assert res_gemma_fast.value.status == "connected"

  res_gemma_smoke = await probe_gemma4_sql_health_result(backend="mlx", run_smoke_test=True)
  assert isinstance(res_gemma_smoke, Ok)
  assert res_gemma_smoke.value.status == "connected"

  with patch(
    "app.services.llm.health_probe.Gemma4SqlProvider.generate_sql_sync",
    side_effect=RuntimeError("Connection refused"),
  ):
    res_gemma_err = await probe_gemma4_sql_health_result(backend="api", api_base="http://bad", run_smoke_test=True)
    assert isinstance(res_gemma_err, Ok)
    assert res_gemma_err.value.status == "offline"

  # 3. probe_any_llm_provider_health_result branches
  with patch("app.services.llm.health_probe.check_duckdb_readonly_ready", return_value=True):
    res_sql = await probe_any_llm_provider_health_result("sql", "SQL")
    assert isinstance(res_sql, Ok)
    assert res_sql.value.status == "connected"

  with patch(
    "app.services.llm.health_probe.probe_ollama_health_result",
    new=AsyncMock(return_value=res_smoke_ok),
  ):
    res_oll = await probe_any_llm_provider_health_result("ollama", "ollama:llama3")
    assert isinstance(res_oll, Ok)

  res_gem_del = await probe_any_llm_provider_health_result(
    "gemma4sql",
    "gemma4sql:google/gemma-4-sql-9b",
    api_key="mlx",
    admin_settings=AdminSettingsResponse(gemma4_sql_backend="mlx"),
  )
  assert isinstance(res_gem_del, Ok)
  assert res_gem_del.value.processor_type == "GEMMA_4_SQL"

  res_gem_del2 = await probe_any_llm_provider_health_result(
    "gemma-4-sql",
    "gemma4sql:google/gemma-4-sql-9b",
    admin_settings=AdminSettingsResponse(gemma4_sql_backend="jax"),
  )
  assert isinstance(res_gem_del2, Ok)

  res_gem_del3 = await probe_any_llm_provider_health_result(
    "gemma-4-sql",
    "gemma4sql:google/gemma-4-sql-9b",
    admin_settings=None,
  )
  assert isinstance(res_gem_del3, Ok)

  monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
  monkeypatch.setattr(settings, "GOOGLE_API_KEY", None)
  res_unconf = await probe_any_llm_provider_health_result("google", "gemini/gemini-2.5-flash")
  assert isinstance(res_unconf, Ok)
  assert res_unconf.value.status == "unconfigured"

  monkeypatch.setattr(settings, "GEMINI_API_KEY", "env-gemini-key")
  res_env_gemini = await probe_any_llm_provider_health_result("gemini", "gemini/gemini-2.5-flash")
  assert isinstance(res_env_gemini, Ok)
  assert res_env_gemini.value.status == "connected"

  res_mock_prov = await probe_any_llm_provider_health_result("mock", "mock/fallback")
  assert isinstance(res_mock_prov, Ok)
  assert res_mock_prov.value.status == "degraded"

  fake_arena = MagicMock(spec=LLMArenaClient)
  fake_arena._build_dynamic_combatant.return_value = {
    "client": MagicMock(),
    "name": "Gemini 2.5 Flash",
    "id": "gemini:gemini-2.5-flash",
    "model_name": "gemini-2.5-flash",
    "provider": "gemini",
    "is_local": False,
  }
  fake_arena._generate_single = AsyncMock(
    return_value=ArenaResponse("Gemini 2.5 Flash", "gemini:gemini-2.5-flash", "SELECT 1;", 25, None)
  )
  res_smoke_cloud = await probe_any_llm_provider_health_result(
    "gemini",
    "gemini:gemini-2.5-flash",
    api_key="AIza-valid",
    run_smoke_test=True,
    arena_client=fake_arena,
  )
  assert isinstance(res_smoke_cloud, Ok)
  assert res_smoke_cloud.value.status == "connected"

  fake_arena._generate_single = AsyncMock(
    return_value=ArenaResponse("Gemini 2.5 Flash", "gemini:gemini-2.5-flash", "", 25, "401 Unauthorized")
  )
  res_smoke_fail = await probe_any_llm_provider_health_result(
    "gemini",
    "gemini:gemini-2.5-flash",
    api_key="AIza-bad",
    run_smoke_test=True,
    arena_client=fake_arena,
  )
  assert isinstance(res_smoke_fail, Ok)
  assert res_smoke_fail.value.status == "auth_error"

  fake_arena._build_dynamic_combatant.return_value = None
  res_smoke_none = await probe_any_llm_provider_health_result(
    "gemini",
    "gemini:gemini-2.5-flash",
    api_key="AIza-valid",
    run_smoke_test=True,
    arena_client=fake_arena,
  )
  assert isinstance(res_smoke_none, Ok)
  assert res_smoke_none.value.status == "connected"

  # 4. probe_connection_request_result dispatch
  req_gemma = LlmConnectionTestRequest(provider="gemma4sql", gemma4_sql_backend="mlx")
  assert isinstance(await probe_connection_request_result(req_gemma), Ok)

  with patch(
    "app.services.llm.health_probe.probe_ollama_health_result",
    new=AsyncMock(return_value=res_smoke_ok),
  ):
    req_oll = LlmConnectionTestRequest(provider="ollama", model_id="llama3")
    assert isinstance(await probe_connection_request_result(req_oll), Ok)

  req_cloud = LlmConnectionTestRequest(provider="openai", model_id="gpt-4o", api_key="sk-test")
  assert isinstance(await probe_connection_request_result(req_cloud), Ok)

  # 5. probe_all_configured_models_result overall status branches
  arena_summary = MagicMock(spec=LLMArenaClient)
  arena_summary.swarm = [{"provider": "openai", "id": "openai/gpt-4o", "name": "GPT-4o", "is_local": False}]
  arena_summary.get_available_processors_async = AsyncMock(
    return_value=[
      ModelInfo(id="SQL", name="SQL [no model]", provider="sql", is_local=True, processor_type="SQL"),
      ModelInfo(id="openai/gpt-4o", name="GPT-4o", provider="openai", is_local=False, processor_type="ANY_LLM"),
    ]
  )
  with patch("app.services.llm.health_probe.check_duckdb_readonly_ready", return_value=True):
    sum_res = await probe_all_configured_models_result(
      admin_settings=AdminSettingsResponse(api_keys={"openai": "sk-ok"}),
      arena_client=arena_summary,
    )
    assert isinstance(sum_res, Ok)
    assert sum_res.value.overall_status == "connected"

    with patch(
      "app.services.llm.health_probe.probe_any_llm_provider_health_result",
      new=AsyncMock(return_value=res_500),
    ):
      sum_crashed = await probe_all_configured_models_result(arena_client=arena_summary)
      assert isinstance(sum_crashed, Ok)
      assert sum_crashed.value.overall_status == "crashed"

    with patch(
      "app.services.llm.health_probe.probe_any_llm_provider_health_result",
      new=AsyncMock(return_value=res_conn_err),
    ):
      sum_offline = await probe_all_configured_models_result(arena_client=arena_summary)
      assert isinstance(sum_offline, Ok)
      assert sum_offline.value.overall_status == "offline"

    arena_summary.swarm = [{"provider": "mock", "id": "mock/fallback", "name": "System Mock", "is_local": True}]
    sum_deg = await probe_all_configured_models_result(
      admin_settings=AdminSettingsResponse(api_keys={"openai": "sk-ok"}),
      arena_client=arena_summary,
    )
    assert isinstance(sum_deg, Ok)
    assert sum_deg.value.overall_status == "degraded"

    # Empty providers list + Err branch
    arena_summary.get_available_processors_async = AsyncMock(
      return_value=[ModelInfo(id="x", name="x", provider="x", is_local=False)]
    )
    with patch(
      "app.services.llm.health_probe.probe_any_llm_provider_health_result",
      new=AsyncMock(return_value=Err(AppError(code=ErrorCode.INTERNAL_ERROR, message="err", status_code=500))),
    ):
      sum_empty = await probe_all_configured_models_result(arena_client=arena_summary)
      assert isinstance(sum_empty, Ok)

  # 6. LLMArenaClient Gemma4Sql init_swarm, get_available_processors_async, and _build_dynamic_combatant
  arena_real = LLMArenaClient()
  arena_real.init_swarm(
    gemma4_sql_enabled=True,
    gemma4_sql_backend="mlx",
    gemma4_sql_model_name="google/gemma-4-sql-9b",
    configured_models=["gemma4sql:google/gemma-4-sql-2b"],
  )
  assert any(c["provider"] == "gemma4sql" for c in arena_real.swarm)

  comb_gemma = arena_real._build_dynamic_combatant(
    "gemma4sql:google/gemma-4-sql-9b",
    AdminSettingsResponse(gemma4_sql_backend="jax", gemma4_sql_api_base="http://localhost:8090"),
  )
  assert comb_gemma is not None
  assert comb_gemma["provider"] == "gemma4sql"

  # get_available_processors_async adding gemma4_sql when include_sql=True and gemma4_sql_enabled=True
  arena_mock_only = LLMArenaClient()
  arena_mock_only.swarm = [
    {
      "client": None,
      "name": "System Mock",
      "id": "mock/fallback",
      "model_name": "mock-model",
      "provider": "mock",
      "is_local": True,
    }
  ]
  procs = await arena_mock_only.get_available_processors_async(
    admin_settings=AdminSettingsResponse(gemma4_sql_enabled=True, visible_models=[]),
    include_sql=True,
  )
  assert any(p.processor_type == "GEMMA_4_SQL" for p in procs)

  # And when visible_models filters out gemma4sql
  procs_filtered = await arena_mock_only.get_available_processors_async(
    admin_settings=AdminSettingsResponse(gemma4_sql_enabled=True, visible_models=["mock/fallback"]),
    include_sql=True,
  )
  assert all(p.processor_type != "GEMMA_4_SQL" for p in procs_filtered)

  # _execute_provider_completion error without remediation
  with patch(
    "app.services.llm_client.classify_llm_error",
    return_value=AppError(code=ErrorCode.LLM_PROVIDER_ERROR, message="plain error", details={"remediation": ""}),
  ):
    bad_client = MagicMock()
    bad_client.completion.side_effect = RuntimeError("fail")
    res_no_rem = await arena_mock_only._execute_provider_completion(
      {
        "client": bad_client,
        "name": "Bad",
        "id": "openai/bad",
        "model_name": "bad",
        "provider": "openai",
        "is_local": False,
      },
      messages=[],
      temperature=0.0,
      max_tokens=10,
      stop=None,
    )
    assert res_no_rem.error == "plain error"

  # _select_stream_combatant dynamic combatant branch
  sel_dyn = arena_mock_only._select_stream_combatant("gemma4sql:google/gemma-4-sql-9b")
  assert sel_dyn["provider"] == "gemma4sql"
  sel_invalid = arena_mock_only._select_stream_combatant("not-a-valid-spec")
  assert sel_invalid["id"] == "mock/fallback"


@pytest.mark.asyncio
async def test_ai_router_health_and_verify_endpoints_and_direct_sql_chat(
  client: AsyncClient,
  db_session: AsyncSession,
) -> None:
  """Verifies `/api/v1/ai/health`, `/api/v1/ai/models/verify`, and direct SQL mode in `ChatService`."""
  mock_user = User(id=uuid.uuid4(), email="ai_health@test.com", hashed_password="pw", is_active=True)
  db_session.add(mock_user)
  await db_session.commit()
  app.dependency_overrides[get_current_user] = lambda: mock_user

  try:
    health_res = await client.get("/api/v1/ai/health")
    assert health_res.status_code == 200
    assert "overall_status" in health_res.json()

    verify_res = await client.post(
      "/api/v1/ai/models/verify",
      json={"provider": "gemma4sql", "gemma4_sql_backend": "mlx", "run_inference_smoke_test": True},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "connected"

    # Test execute_readonly_duckdb_preview and direct SQL mode in ChatService
    with patch(
      "app.services.chat_service.sql_generator.execute_sql_preview_result",
      new=AsyncMock(return_value=Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="empty sql", status_code=400))),
    ):
      prev_err = await execute_readonly_duckdb_preview("")
      assert prev_err.error == "empty sql"

    with patch(
      "app.services.chat_service.sql_generator.execute_sql_preview_result",
      new=AsyncMock(return_value=Ok(SQLExecutionResponse(columns=["cnt"], data=[{"cnt": 5}], error=None))),
    ):
      prev_ok = await execute_readonly_duckdb_preview("SELECT 5 AS cnt")
      assert prev_ok.row_count == 1
      assert prev_ok.error is None

      svc = ChatService()
      # Direct SQL only
      res_direct_only = await svc._collect_arena_responses(
        messages_payload=[{"role": "user", "content": "SELECT 5 AS cnt"}],
        target_models=["SQL"],
        admin_settings=None,
        arena_client=MagicMock(spec=LLMArenaClient),
      )
      assert len(res_direct_only) == 1
      assert res_direct_only[0].model_identifier == "SQL"
      assert "Executed directly on read-only DuckDB" in res_direct_only[0].content

      # Direct SQL + LLM model
      mock_arena = MagicMock(spec=LLMArenaClient)
      mock_arena.generate_arena_competition = AsyncMock(
        return_value=[ArenaResponse("Gemma", "gemma4sql:m", f"```sql{chr(10)}SELECT 1{chr(10)}```", 10, None)]
      )
      res_mixed = await svc._collect_arena_responses(
        messages_payload=[{"role": "user", "content": "SELECT 5 AS cnt"}],
        target_models=["SQL", "gemma4sql:m"],
        admin_settings=None,
        arena_client=mock_arena,
      )
      assert len(res_mixed) == 2

      # Stream direct SQL via stream_conversation_events
      conv = Conversation(id=uuid.uuid4(), user_id=mock_user.id, title="Direct SQL Stream")
      db_session.add(conv)
      await db_session.commit()

      events = [
        ev
        async for ev in svc.stream_conversation_events(
          conversation_id=conv.id,
          messages_payload=[{"role": "user", "content": "SELECT 5 AS cnt"}],
          admin_settings=None,
          db=db_session,
          model_id="SQL",
        )
      ]
      assert any('"event": "done"' in e for e in events)

    # Direct SQL with DuckDB error
    with patch(
      "app.services.chat_service.sql_generator.execute_sql_preview_result",
      new=AsyncMock(return_value=Ok(SQLExecutionResponse(columns=[], data=[], error="Binder Error: table not found"))),
    ):
      svc_err = ChatService()
      res_direct_err = await svc_err._build_direct_sql_arena_response(
        [{"role": "user", "content": "SELECT * FROM missing_tbl"}]
      )
      assert "DuckDB Validation Error" in res_direct_err.content
  finally:
    app.dependency_overrides.pop(get_current_user, None)
