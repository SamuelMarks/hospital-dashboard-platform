"""
LLM Provider & Model Connection Health Probe Service.

Validates connectivity, API key presence, model availability, and optional 1-token
smoke inference for `any-llm` cloud providers (Gemini, OpenAI, Anthropic, Mistral, Groq, etc.),
local Ollama (`llama-server`), `gemma-4-sql`, and the read-only DuckDB analytical engine.
"""

from __future__ import annotations

from datetime import UTC, datetime
import time

import httpx

from app.core.config import settings
from app.core.result import AppResult, ErrorCode, Ok
from app.database.duckdb import duckdb_manager
from app.schemas.admin import AdminSettingsResponse
from app.schemas.ai import (
  LlmConnectionStatus,
  LlmConnectionTestRequest,
  LlmHealthSummaryResponse,
  LlmProviderHealthResponse,
)
from app.services.llm.discovery import (
  _infer_processor_type,
  _normalize_ollama_root_url,
  normalize_ollama_tag_key,
  resolve_ollama_model_alias,
)
from app.services.llm.error_classifier import classify_llm_error
from app.services.llm.gemma4_sql_provider import Gemma4SqlProvider
from app.services.llm_client import LLMArenaClient, llm_client


def _map_error_code_to_status(code: str) -> LlmConnectionStatus:
  """
  Maps a classified `ErrorCode` string to a `LlmConnectionStatus` literal.

  Args:
      code (str): Canonical `ErrorCode` value.

  Returns:
      LlmConnectionStatus: Mapped status literal.
  """
  if code == ErrorCode.LLM_LOCAL_PROCESS_CRASHED:
    return "crashed"
  if code == ErrorCode.LLM_AUTH_INVALID:
    return "auth_error"
  if code == ErrorCode.LLM_CONNECTION_REFUSED:
    return "offline"
  if code in {ErrorCode.LLM_MODEL_NOT_FOUND, ErrorCode.LLM_QUOTA_EXCEEDED}:
    return "degraded"
  return "error"


def check_duckdb_readonly_ready() -> bool:
  """
  Verifies that a read-only DuckDB connection can be opened and queried.

  Returns:
      bool: True if `SELECT 1` succeeds on `duckdb_manager.get_readonly_connection()`, False otherwise.
  """
  try:
    conn = duckdb_manager.get_readonly_connection()
    try:
      row = conn.execute("SELECT 1").fetchone()
      return row is not None and row[0] == 1
    finally:
      conn.close()
  except (OSError, RuntimeError, ValueError, TypeError, Exception):
    return False


async def probe_ollama_health_result(
  api_base: str | None = None,
  model_name: str | None = None,
  run_smoke_test: bool = False,
  http_client: httpx.AsyncClient | None = None,
) -> AppResult[LlmProviderHealthResponse]:
  """
  Probes the local or remote Ollama server (`/api/tags` and optional 1-token `/api/generate`).

  Detects unreachable Ollama daemons, unpulled model tags, and `llama-server` segmentation faults.

  Args:
      api_base (str | None): Optional custom Ollama base URL.
      model_name (str | None): Optional specific Ollama model tag to verify.
      run_smoke_test (bool): Whether to execute a 1-token generation smoke test.
      http_client (httpx.AsyncClient | None): Optional pre-configured async HTTP client for testing.

  Returns:
      AppResult[LlmProviderHealthResponse]: `Ok(LlmProviderHealthResponse)` describing connection validity.
  """
  root_url = _normalize_ollama_root_url(api_base)
  raw_model = (model_name or settings.DEFAULT_OLLAMA_MODEL or "gemma:2b").removeprefix("ollama:").removeprefix(
    "ollama/"
  ).strip() or "gemma:2b"
  clean_model = resolve_ollama_model_alias(raw_model)
  model_id = f"ollama:{clean_model}"
  owns_client = http_client is None
  client = http_client if http_client is not None else httpx.AsyncClient(timeout=3.0)
  start = time.perf_counter()

  try:
    tags_resp = await client.get(f"{root_url}/api/tags")
    latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
    if tags_resp.status_code != 200:
      err = classify_llm_error("ollama", clean_model, f"HTTP {tags_resp.status_code}: {tags_resp.text}")
      return Ok(
        LlmProviderHealthResponse(
          provider="ollama",
          model_id=model_id,
          display_name=f"Ollama: {clean_model}",
          processor_type="OLLAMA",
          is_local=True,
          status=_map_error_code_to_status(str(err.code)),
          latency_ms=latency_ms,
          message=err.message,
          error_code=str(err.code),
          remediation=str(err.details.get("remediation") or ""),
          checked_at=datetime.now(UTC),
        )
      )

    payload = tags_resp.json()
    raw_models = payload.get("models", []) if isinstance(payload, dict) else []
    available_tags = {
      str(item.get("name") or "").strip()
      for item in raw_models
      if isinstance(item, dict) and str(item.get("name") or "").strip()
    }
    normalized_available = {normalize_ollama_tag_key(tag) for tag in available_tags}
    target_norm = normalize_ollama_tag_key(clean_model)
    base_names = {tag.split(":", 1)[0].lower() for tag in available_tags}
    target_has_explicit_non_latest_tag = ":" in clean_model and not clean_model.lower().endswith(":latest")
    is_matched = (
      clean_model in available_tags
      or target_norm in normalized_available
      or (not target_has_explicit_non_latest_tag and target_norm.split(":", 1)[0] in base_names)
    )
    if available_tags and not is_matched:
      return Ok(
        LlmProviderHealthResponse(
          provider="ollama",
          model_id=model_id,
          display_name=f"Ollama: {clean_model}",
          processor_type="OLLAMA",
          is_local=True,
          status="degraded",
          latency_ms=latency_ms,
          message=f"Ollama is reachable at {root_url}, but model '{clean_model}' is not pulled locally.",
          error_code=str(ErrorCode.LLM_MODEL_NOT_FOUND),
          remediation=f"Run `ollama pull {clean_model}` to download the model weights.",
          checked_at=datetime.now(UTC),
        )
      )

    if run_smoke_test:
      gen_resp = await client.post(
        f"{root_url}/api/generate",
        json={"model": clean_model, "prompt": "SELECT 1;", "stream": False, "options": {"num_predict": 1}},
      )
      latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
      if gen_resp.status_code != 200:
        err = classify_llm_error("ollama", clean_model, f"HTTP {gen_resp.status_code}: {gen_resp.text}")
        return Ok(
          LlmProviderHealthResponse(
            provider="ollama",
            model_id=model_id,
            display_name=f"Ollama: {clean_model}",
            processor_type="OLLAMA",
            is_local=True,
            status=_map_error_code_to_status(str(err.code)),
            latency_ms=latency_ms,
            message=err.message,
            error_code=str(err.code),
            remediation=str(err.details.get("remediation") or ""),
            checked_at=datetime.now(UTC),
          )
        )

    return Ok(
      LlmProviderHealthResponse(
        provider="ollama",
        model_id=model_id,
        display_name=f"Ollama: {clean_model}",
        processor_type="OLLAMA",
        is_local=True,
        status="connected",
        latency_ms=latency_ms,
        message=f"Connected to Ollama at {root_url} ({len(available_tags)} local models available).",
        checked_at=datetime.now(UTC),
      )
    )
  except Exception as exc:
    latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
    err = classify_llm_error("ollama", clean_model, exc)
    return Ok(
      LlmProviderHealthResponse(
        provider="ollama",
        model_id=model_id,
        display_name=f"Ollama: {clean_model}",
        processor_type="OLLAMA",
        is_local=True,
        status=_map_error_code_to_status(str(err.code)),
        latency_ms=latency_ms,
        message=err.message,
        error_code=str(err.code),
        remediation=str(err.details.get("remediation") or ""),
        checked_at=datetime.now(UTC),
      )
    )
  finally:
    if owns_client:
      await client.aclose()


async def probe_gemma4_sql_health_result(
  model_name: str | None = None,
  backend: str | None = None,
  api_base: str | None = None,
  run_smoke_test: bool = False,
) -> AppResult[LlmProviderHealthResponse]:
  """
  Probes the `gemma-4-sql` provider (native SDK / synthesizer or remote HTTP server).

  Args:
      model_name (str | None): Optional target `gemma-4-sql` model name.
      backend (str | None): Optional backend identifier (`'mlx'`, `'jax'`, `'pytorch'`, `'keras'`, `'maxtext'`, `'api'`).
      api_base (str | None): Optional remote `gemma-4-sql serve` URL.
      run_smoke_test (bool): Whether to run a fast SQL synthesis smoke test.

  Returns:
      AppResult[LlmProviderHealthResponse]: `Ok(LlmProviderHealthResponse)` with connection telemetry.
  """
  target_model = (model_name or settings.GEMMA4_SQL_MODEL_NAME).removeprefix("gemma4sql:").removeprefix("gemma4sql/")
  target_backend = (backend or settings.GEMMA4_SQL_BACKEND).lower()
  target_base = api_base if api_base is not None else settings.GEMMA4_SQL_API_BASE
  model_id = f"gemma4sql:{target_model}"
  start = time.perf_counter()

  valid_backends = {"mlx", "jax", "pytorch", "keras", "maxtext", "api"}
  if target_backend not in valid_backends:
    return Ok(
      LlmProviderHealthResponse(
        provider="gemma4sql",
        model_id=model_id,
        display_name=f"Gemma-4-SQL ({target_backend.upper()})",
        processor_type="GEMMA_4_SQL",
        is_local=True,
        status="error",
        latency_ms=0.0,
        message=f"Unsupported gemma-4-sql backend '{target_backend}'.",
        error_code=str(ErrorCode.CONFIGURATION_ERROR),
        remediation=f"Select one of: {', '.join(sorted(valid_backends))}.",
        checked_at=datetime.now(UTC),
      )
    )

  try:
    provider = Gemma4SqlProvider(
      model_name=target_model,
      backend=target_backend,
      api_base=target_base,
    )
    if run_smoke_test or target_base:
      res = provider.generate_sql_sync("Count patients by service")
      latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
      return Ok(
        LlmProviderHealthResponse(
          provider="gemma4sql",
          model_id=model_id,
          display_name=provider.name,
          processor_type="GEMMA_4_SQL",
          is_local=True,
          status="connected",
          latency_ms=latency_ms,
          message=f"gemma-4-sql ({target_backend.upper()}) ready — verified SQL generation ({res['status']}).",
          checked_at=datetime.now(UTC),
        )
      )

    latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
    return Ok(
      LlmProviderHealthResponse(
        provider="gemma4sql",
        model_id=model_id,
        display_name=provider.name,
        processor_type="GEMMA_4_SQL",
        is_local=True,
        status="connected",
        latency_ms=latency_ms,
        message=f"gemma-4-sql ({target_backend.upper()}) configured and ready.",
        checked_at=datetime.now(UTC),
      )
    )
  except Exception as exc:
    latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
    err = classify_llm_error("gemma4sql", target_model, exc)
    return Ok(
      LlmProviderHealthResponse(
        provider="gemma4sql",
        model_id=model_id,
        display_name=f"Gemma-4-SQL ({target_backend.upper()})",
        processor_type="GEMMA_4_SQL",
        is_local=True,
        status=_map_error_code_to_status(str(err.code)),
        latency_ms=latency_ms,
        message=err.message,
        error_code=str(err.code),
        remediation=str(err.details.get("remediation") or ""),
        checked_at=datetime.now(UTC),
      )
    )


def _resolve_effective_api_key(
  prov_lower: str,
  api_key: str | None,
  admin_settings: AdminSettingsResponse | None,
) -> str | None:
  """
  Resolves the effective API key for `prov_lower` from explicit override, admin settings, or environment.

  Args:
      prov_lower (str): Normalized provider slug.
      api_key (str | None): Explicit API key override.
      admin_settings (AdminSettingsResponse | None): Optional admin settings containing saved API keys.

  Returns:
      str | None: Resolved API key or None.
  """
  saved_keys = (admin_settings.api_keys if admin_settings and admin_settings.api_keys else {}) or {}
  env_key = settings.get_provider_api_key(prov_lower)
  return (
    api_key or saved_keys.get(prov_lower) or (saved_keys.get("google") if prov_lower == "gemini" else None) or env_key
  )


def _probe_sql_processor_health() -> AppResult[LlmProviderHealthResponse]:
  """
  Probes the read-only DuckDB SQL processor (`SQL [no model]`).

  Returns:
      AppResult[LlmProviderHealthResponse]: `Ok(LlmProviderHealthResponse)` for the SQL processor.
  """
  duck_ok = check_duckdb_readonly_ready()
  return Ok(
    LlmProviderHealthResponse(
      provider="sql",
      model_id="SQL",
      display_name="SQL [no model]",
      processor_type="SQL",
      is_local=True,
      status="connected" if duck_ok else "offline",
      latency_ms=1.0,
      message="Read-only DuckDB SQL engine is ready." if duck_ok else "Read-only DuckDB connection failed.",
      error_code=None if duck_ok else str(ErrorCode.DUCKDB_STORAGE_ERROR),
      remediation=None if duck_ok else "Trigger dataset re-ingestion in System Diagnostics.",
      checked_at=datetime.now(UTC),
    )
  )


async def _run_cloud_smoke_test(
  prov_lower: str,
  clean_model: str,
  canonical_id: str,
  effective_key: str,
  arena_client: LLMArenaClient,
) -> AppResult[LlmProviderHealthResponse] | None:
  """
  Executes a 1-token completion smoke test for an `any-llm` cloud provider.

  Args:
      prov_lower (str): Normalized provider slug.
      clean_model (str): Model name without provider prefix.
      canonical_id (str): Canonical `provider/model` identifier.
      effective_key (str): Resolved API key.
      arena_client (LLMArenaClient): Arena client used for completion.

  Returns:
      AppResult[LlmProviderHealthResponse] | None: Smoke test result or None if combatant could not be built.
  """
  proc_type = _infer_processor_type(prov_lower, canonical_id, False)
  start = time.perf_counter()
  comb = arena_client._build_dynamic_combatant(
    f"{prov_lower}:{clean_model}",
    AdminSettingsResponse(api_keys={prov_lower: effective_key}),
  )
  if comb is None:
    return None
  arena_res = await arena_client._generate_single(
    comb,
    [{"role": "user", "content": "SELECT 1;"}],
    temperature=0.0,
    max_tokens=8,
    stop=None,
    admin_settings=AdminSettingsResponse(api_keys={prov_lower: effective_key}),
  )
  latency_ms = round((time.perf_counter() - start) * 1000.0, 2)
  if arena_res.error:
    err = classify_llm_error(prov_lower, clean_model, arena_res.error)
    return Ok(
      LlmProviderHealthResponse(
        provider=prov_lower,
        model_id=canonical_id,
        display_name=comb["name"],
        processor_type=proc_type,
        is_local=False,
        status=_map_error_code_to_status(str(err.code)),
        latency_ms=latency_ms,
        message=err.message,
        error_code=str(err.code),
        remediation=str(err.details.get("remediation") or ""),
        checked_at=datetime.now(UTC),
      )
    )
  return Ok(
    LlmProviderHealthResponse(
      provider=prov_lower,
      model_id=canonical_id,
      display_name=comb["name"],
      processor_type=proc_type,
      is_local=False,
      status="connected",
      latency_ms=latency_ms,
      message=f"Verified live completion with '{prov_lower}' ({clean_model}).",
      checked_at=datetime.now(UTC),
    )
  )


async def probe_any_llm_provider_health_result(
  provider: str,
  model_id: str | None = None,
  api_key: str | None = None,
  api_base: str | None = None,
  run_smoke_test: bool = False,
  arena_client: LLMArenaClient = llm_client,
  admin_settings: AdminSettingsResponse | None = None,
) -> AppResult[LlmProviderHealthResponse]:
  """
  Probes an `any-llm` cloud or custom provider (Gemini, OpenAI, Anthropic, Mistral, Groq, etc.).

  Args:
      provider (str): Provider slug (`'gemini'`, `'openai'`, `'anthropic'`, `'mistral'`, `'groq'`, etc.).
      model_id (str | None): Optional model identifier (`'gemini:gemini-2.5-flash'`, `'openai/gpt-4o'`).
      api_key (str | None): Optional API key override.
      api_base (str | None): Optional custom API base URL override.
      run_smoke_test (bool): Whether to run a live 1-token completion check.
      arena_client (LLMArenaClient): Arena client used for smoke completion.
      admin_settings (AdminSettingsResponse | None): Optional admin settings containing saved API keys.

  Returns:
      AppResult[LlmProviderHealthResponse]: `Ok(LlmProviderHealthResponse)` with connection validity.
  """
  prov_lower = "gemini" if provider.lower().strip() == "google" else provider.lower().strip()

  if prov_lower == "sql" or (model_id and model_id.upper() == "SQL"):
    return _probe_sql_processor_health()

  if prov_lower == "ollama" or (model_id and model_id.lower().startswith(("ollama:", "ollama/"))):
    eff_base = api_base or (admin_settings.ollama_api_base if admin_settings else None)
    return await probe_ollama_health_result(api_base=eff_base, model_name=model_id, run_smoke_test=run_smoke_test)

  if prov_lower in {"gemma4sql", "gemma-4-sql", "gemma_4_sql"} or (model_id and "gemma-4-sql" in model_id.lower()):
    eff_backend = api_key if api_key in {"mlx", "jax", "pytorch", "keras", "maxtext", "api"} else None
    if eff_backend is None and admin_settings:
      eff_backend = admin_settings.gemma4_sql_backend
    eff_base = api_base or (admin_settings.gemma4_sql_api_base if admin_settings else None)
    return await probe_gemma4_sql_health_result(
      model_name=model_id,
      backend=eff_backend,
      api_base=eff_base,
      run_smoke_test=run_smoke_test,
    )

  clean_model = (model_id or f"{prov_lower}:default").split(":", 1)[-1].split("/", 1)[-1]
  canonical_id = model_id or f"{prov_lower}/{clean_model}"
  proc_type = _infer_processor_type(prov_lower, canonical_id, False)
  effective_key = _resolve_effective_api_key(prov_lower, api_key, admin_settings)

  if not effective_key and prov_lower != "mock":
    return Ok(
      LlmProviderHealthResponse(
        provider=prov_lower,
        model_id=canonical_id,
        display_name=f"{clean_model} ({prov_lower})",
        processor_type=proc_type,
        is_local=False,
        status="unconfigured",
        latency_ms=None,
        message=f"No API key configured for provider '{prov_lower}'.",
        error_code=str(ErrorCode.LLM_AUTH_INVALID),
        remediation=f"Add your '{prov_lower}' API key in Admin Configuration or set {prov_lower.upper()}_API_KEY.",
        checked_at=datetime.now(UTC),
      )
    )

  if run_smoke_test:
    smoke_res = await _run_cloud_smoke_test(prov_lower, clean_model, canonical_id, str(effective_key or ""), arena_client)
    if smoke_res is not None:
      return smoke_res

  return Ok(
    LlmProviderHealthResponse(
      provider=prov_lower,
      model_id=canonical_id,
      display_name=f"{clean_model} ({prov_lower})",
      processor_type=proc_type,
      is_local=prov_lower == "mock",
      status="degraded" if prov_lower == "mock" else "connected",
      latency_ms=1.0,
      message=(
        "Fallback Mock Provider active (no real LLM keys configured)."
        if prov_lower == "mock"
        else f"API key configured for '{prov_lower}' ({clean_model})."
      ),
      checked_at=datetime.now(UTC),
    )
  )


async def probe_connection_request_result(
  request: LlmConnectionTestRequest,
  admin_settings: AdminSettingsResponse | None = None,
  arena_client: LLMArenaClient = llm_client,
) -> AppResult[LlmProviderHealthResponse]:
  """
  Dispatches a `LlmConnectionTestRequest` to the appropriate provider probe (`ollama`, `gemma4sql`, or `any-llm`).

  Args:
      request (LlmConnectionTestRequest): Connection test parameters.
      admin_settings (AdminSettingsResponse | None): Optional persisted admin settings.
      arena_client (LLMArenaClient): Arena client instance.

  Returns:
      AppResult[LlmProviderHealthResponse]: `Ok(LlmProviderHealthResponse)` with probe results.
  """
  prov = request.provider.lower().strip()
  if prov in {"gemma4sql", "gemma-4-sql", "gemma_4_sql"}:
    return await probe_gemma4_sql_health_result(
      model_name=request.model_id,
      backend=request.gemma4_sql_backend,
      api_base=request.api_base,
      run_smoke_test=request.run_inference_smoke_test,
    )
  if prov == "ollama":
    return await probe_ollama_health_result(
      api_base=request.api_base or (admin_settings.ollama_api_base if admin_settings else None),
      model_name=request.model_id,
      run_smoke_test=request.run_inference_smoke_test,
    )
  return await probe_any_llm_provider_health_result(
    provider=prov,
    model_id=request.model_id,
    api_key=request.api_key,
    api_base=request.api_base,
    run_smoke_test=request.run_inference_smoke_test,
    arena_client=arena_client,
    admin_settings=admin_settings,
  )


async def probe_all_configured_models_result(
  admin_settings: AdminSettingsResponse | None = None,
  run_smoke_test: bool = False,
  arena_client: LLMArenaClient = llm_client,
) -> AppResult[LlmHealthSummaryResponse]:
  """
  Evaluates connection health across all configured models in `arena_client` and `admin_settings`,
  plus read-only DuckDB readiness.

  Args:
      admin_settings (AdminSettingsResponse | None): Optional admin settings override.
      run_smoke_test (bool): Whether to run live 1-token smoke tests against each model.
      arena_client (LLMArenaClient): Arena client instance.

  Returns:
      AppResult[LlmHealthSummaryResponse]: Aggregated `LlmHealthSummaryResponse`.
  """
  models = await arena_client.get_available_processors_async(
    admin_settings=admin_settings,
    include_sql=True,
    discover_ollama=False,
  )
  mock_mode = len(arena_client.swarm) == 1 and arena_client.swarm[0].get("provider") == "mock"
  duck_ready = check_duckdb_readonly_ready()

  provider_results: list[LlmProviderHealthResponse] = []
  for model in models:
    res = await probe_any_llm_provider_health_result(
      provider=model.provider,
      model_id=model.id,
      run_smoke_test=run_smoke_test,
      arena_client=arena_client,
      admin_settings=admin_settings,
    )
    if isinstance(res, Ok):
      item = res.value
      item.display_name = model.name
      provider_results.append(item)

  healthy_count = sum(1 for p in provider_results if p.status == "connected")
  unhealthy_count = len(provider_results) - healthy_count

  overall: LlmConnectionStatus = "connected"
  if any(p.status == "crashed" for p in provider_results):
    overall = "crashed"
  elif healthy_count == 0 and provider_results:
    overall = "offline"
  elif unhealthy_count > 0 or mock_mode or not duck_ready:
    overall = "degraded"

  return Ok(
    LlmHealthSummaryResponse(
      overall_status=overall,
      active_count=len(provider_results),
      healthy_count=healthy_count,
      unhealthy_count=unhealthy_count,
      mock_mode=mock_mode,
      duckdb_readonly_ready=duck_ready,
      providers=provider_results,
    )
  )


__all__ = [
  "check_duckdb_readonly_ready",
  "probe_all_configured_models_result",
  "probe_any_llm_provider_health_result",
  "probe_connection_request_result",
  "probe_gemma4_sql_health_result",
  "probe_ollama_health_result",
]
