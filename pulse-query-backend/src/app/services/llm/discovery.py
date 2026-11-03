"""
Ollama, `gemma-4-sql`, Gemini, and `any-llm` model discovery utilities and processor metadata helpers.
"""

from collections.abc import Mapping, Sequence

import httpx

from app.core.config import settings
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.admin import AdminSettingsResponse
from app.schemas.ai import ModelInfo, ProcessorType
from app.schemas.json_types import JsonPrimitive

SQL_NO_MODEL_INFO = ModelInfo(
  id="SQL",
  name="SQL [no model]",
  provider="sql",
  is_local=True,
  processor_type="SQL",
  status="connected",
  supports_sql_generation=False,
  supports_streaming=False,
  backend_engine="duckdb",
)

DEFAULT_CHOICE_OLLAMA_MODELS: tuple[ModelInfo, ...] = (
  ModelInfo(
    id="ollama:hf.co/google/gemma-4-E4B",
    name="Gemma 4 E4B (google/gemma-4-E4B)",
    provider="ollama",
    is_local=True,
    processor_type="OLLAMA",
    status="connected",
    backend_engine="ollama",
  ),
  ModelInfo(
    id="ollama:hf.co/microsoft/Phi-4-mini-flash-reasoning",
    name="Phi-4 Mini Flash Reasoning (microsoft/Phi-4-mini-flash-reasoning)",
    provider="ollama",
    is_local=True,
    processor_type="OLLAMA",
    status="connected",
    backend_engine="ollama",
  ),
  ModelInfo(
    id="ollama:hf.co/meta-llama/Llama-3.2-1B",
    name="Llama 3.2 1B (meta-llama/Llama-3.2-1B)",
    provider="ollama",
    is_local=True,
    processor_type="OLLAMA",
    status="connected",
    backend_engine="ollama",
  ),
)


def _normalize_ollama_root_url(raw_host: str | None) -> str:
  """
  Normalizes an Ollama host URL (e.g. `http://localhost:11434/v1`) to its base daemon root.

  Args:
      raw_host (str | None): Configured Ollama host URL string.

  Returns:
      str: Root URL without trailing `/v1` or slash.
  """
  base = (raw_host or settings.OLLAMA_HOST or "http://localhost:11434").strip().rstrip("/")
  if base.endswith("/v1"):
    base = base[:-3].rstrip("/")
  return base


def _parse_configured_model_entry(entry: str) -> tuple[str, str, str] | None:
  """
  Parses a `provider:model` or `provider/model` (with optional `|Display Name`) string.

  Args:
      entry (str): Raw configured model string.

  Returns:
      tuple[str, str, str] | None: Tuple of `(provider, model_name, display_name)` or `None` if invalid.
  """
  cleaned = entry.strip()
  if not cleaned:
    return None
  display_override: str | None = None
  if "|" in cleaned:
    cleaned, display_override = [part.strip() for part in cleaned.split("|", 1)]

  colon_idx = cleaned.find(":")
  slash_idx = cleaned.find("/")
  if colon_idx > 0 and (slash_idx == -1 or colon_idx < slash_idx):
    sep = ":"
  elif slash_idx > 0:
    sep = "/"
  else:
    return None

  provider, model_name = [part.strip() for part in cleaned.split(sep, 1)]
  if not provider or not model_name:
    return None
  prov_lower = provider.lower()
  if prov_lower in {"gemma-4-sql", "gemma_4_sql", "gemma4sql"}:
    prov_lower = "gemma4sql"
  elif prov_lower == "google":
    prov_lower = "gemini"

  display_name = display_override if display_override else f"{model_name} ({prov_lower})"
  return prov_lower, model_name, display_name


def _infer_processor_type(provider: str, model_id: str, is_local: bool) -> ProcessorType:
  """
  Infers the `ProcessorType` category for a given provider and model identifier.

  Args:
      provider (str): Provider slug.
      model_id (str): Model identifier string.
      is_local (bool): Whether the model is marked as local.

  Returns:
      ProcessorType: `'SQL'`, `'OLLAMA'`, `'GEMMA_4_SQL'`, `'GEMINI'`, or `'ANY_LLM'`.
  """
  prov_lower = provider.lower()
  mod_lower = model_id.lower()
  if model_id.upper() == "SQL" or prov_lower == "sql":
    return "SQL"
  if prov_lower in {"gemma4sql", "gemma-4-sql", "gemma_4_sql"} or "gemma-4-sql" in mod_lower:
    return "GEMMA_4_SQL"
  if prov_lower in {"gemini", "google"} or mod_lower.startswith(("gemini/", "gemini:", "google/")):
    return "GEMINI"
  if prov_lower == "ollama" or mod_lower.startswith(("ollama/", "ollama:")) or is_local:
    return "OLLAMA"
  return "ANY_LLM"


def build_gemma4_sql_model_info(admin_settings: AdminSettingsResponse | None = None) -> ModelInfo:
  """
  Constructs a `ModelInfo` entry for the configured `gemma-4-sql` processor.

  Args:
      admin_settings (AdminSettingsResponse | None): Optional admin configuration overrides.

  Returns:
      ModelInfo: Descriptor for the `gemma-4-sql` processor.
  """
  backend = (
    admin_settings.gemma4_sql_backend
    if admin_settings and admin_settings.gemma4_sql_backend
    else settings.GEMMA4_SQL_BACKEND
  )
  model_name = (
    admin_settings.gemma4_sql_model_name
    if admin_settings and admin_settings.gemma4_sql_model_name
    else settings.GEMMA4_SQL_MODEL_NAME
  )
  return ModelInfo(
    id=f"gemma4sql:{model_name}",
    name=f"Gemma-4-SQL ({backend.upper()})",
    provider="gemma4sql",
    is_local=True,
    processor_type="GEMMA_4_SQL",
    status="connected",
    supports_sql_generation=True,
    supports_streaming=True,
    backend_engine=backend,
  )


async def discover_ollama_models_result(
  ollama_api_base: str | None = None,
  http_client: httpx.AsyncClient | None = None,
) -> AppResult[list[ModelInfo]]:
  """
  Queries the Ollama `/api/tags` endpoint to dynamically discover locally available Ollama models.

  Args:
      ollama_api_base (str | None): Optional override for the Ollama server base URL.
      http_client (httpx.AsyncClient | None): Optional pre-configured async HTTP client for testing.

  Returns:
      AppResult[list[ModelInfo]]: `Ok` containing discovered Ollama `ModelInfo` items, or `Err(AppError)`.
  """
  from app.services import llm_client as llm_mod

  root_url = _normalize_ollama_root_url(ollama_api_base)
  tags_url = f"{root_url}/api/tags"
  owns_client = http_client is None
  client = http_client if http_client is not None else llm_mod.httpx.AsyncClient(timeout=1.5)
  try:
    resp = await client.get(tags_url)
    if resp.status_code != 200:
      return Err(
        AppError(
          code=ErrorCode.LLM_PROVIDER_ERROR,
          message=f"Ollama discovery returned HTTP {resp.status_code}",
          status_code=503,
        )
      )
    payload = resp.json()
    raw_models = payload.get("models", []) if isinstance(payload, dict) else []
    discovered: list[ModelInfo] = []
    for item in raw_models:
      if isinstance(item, dict) and str(item.get("name") or "").strip():
        model_name = str(item["name"]).strip()
        discovered.append(
          ModelInfo(
            id=f"ollama:{model_name}",
            name=f"Ollama: {model_name}",
            provider="ollama",
            is_local=True,
            processor_type="OLLAMA",
            status="connected",
            backend_engine="ollama",
          )
        )
    return Ok(discovered)
  except Exception as exc:
    return Err(
      AppError(
        code=ErrorCode.LLM_PROVIDER_ERROR,
        message=f"Ollama discovery failed: {exc!s}",
        status_code=503,
      )
    )
  finally:
    if owns_client:
      await client.aclose()


def _append_unique_models(
  target: list[ModelInfo],
  seen: set[str],
  candidates: Sequence[ModelInfo],
  visible_filter: set[str] | None = None,
) -> None:
  """
  Appends `candidates` to `target` while deduplicating normalized IDs (`:` vs `/`) and applying `visible_filter`.

  Args:
      target (list[ModelInfo]): Destination list of `ModelInfo` items.
      seen (set[str]): Set of already-included raw and normalized model identifiers.
      candidates (Sequence[ModelInfo]): Candidate `ModelInfo` items to append.
      visible_filter (set[str] | None): Optional visibility whitelist.
  """
  for model in candidates:
    if visible_filter and model.id not in visible_filter:
      continue
    norm_key = model.id.replace(":", "/")
    if model.id not in seen and norm_key not in seen:
      target.append(model)
      seen.add(model.id)
      seen.add(norm_key)


def assemble_available_models(
  swarm_entries: Sequence[Mapping[str, JsonPrimitive]],
  admin_settings: AdminSettingsResponse | None = None,
  include_sql: bool = False,
  discovered_ollama: list[ModelInfo] | None = None,
) -> list[ModelInfo]:
  """
  Assembles and deduplicates available `ModelInfo` records from swarm entries, admin settings, and Ollama discovery.

  Args:
      swarm_entries (Sequence[Mapping[str, JsonPrimitive]]): Active swarm combatant dictionaries.
      admin_settings (AdminSettingsResponse | None): Optional admin configuration to filter models by visibility.
      include_sql (bool): Whether to prepend the `SQL [no model]` processor option.
      discovered_ollama (list[ModelInfo] | None): Optional list of dynamically discovered Ollama models.

  Returns:
      list[ModelInfo]: Deduplicated list of configured model/processor information objects.
  """
  swarm_models = [
    ModelInfo(
      id=str(m["id"]),
      name=str(m["name"]),
      provider=str(m["provider"]),
      is_local=bool(m.get("is_local", False)),
      processor_type=_infer_processor_type(str(m["provider"]), str(m["id"]), bool(m.get("is_local", False))),
      status="connected",
      backend_engine=str(m["provider"]),
    )
    for m in swarm_entries
  ]
  visible_set = set(admin_settings.visible_models) if admin_settings and admin_settings.visible_models else None
  if visible_set:
    swarm_models = [m for m in swarm_models if m.id in visible_set]

  for extra_entry in admin_settings.configured_models if admin_settings and admin_settings.configured_models else []:
    parsed = _parse_configured_model_entry(extra_entry)
    if parsed is not None:
      prov, mod_name, disp_name = parsed
      is_loc = prov in {"ollama", "gemma4sql", "llamacpp"}
      cand_id = f"{prov}:{mod_name}"
      if all(existing.id not in {cand_id, f"{prov}/{mod_name}"} for existing in swarm_models):
        swarm_models.append(
          ModelInfo(
            id=cand_id,
            name=disp_name,
            provider=prov,
            is_local=is_loc,
            processor_type=_infer_processor_type(prov, cand_id, is_loc),
            status="connected",
            backend_engine=prov,
          )
        )

  combined: list[ModelInfo] = []
  seen: set[str] = set()

  if include_sql:
    combined.append(SQL_NO_MODEL_INFO)
    seen.add(SQL_NO_MODEL_INFO.id)

  _append_unique_models(combined, seen, discovered_ollama or [])
  if include_sql:
    _append_unique_models(combined, seen, DEFAULT_CHOICE_OLLAMA_MODELS, visible_filter=visible_set)
  _append_unique_models(combined, seen, swarm_models)

  return combined
