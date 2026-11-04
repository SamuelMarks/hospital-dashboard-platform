"""
Ollama, `gemma-4-sql`, Gemini, and `any-llm` model discovery utilities and processor metadata helpers.
"""

from collections.abc import Mapping, Sequence

import httpx

from app.core.config import _is_filesystem_path, settings
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

OLLAMA_CHOICE_MODEL_ALIASES: dict[str, str] = {
  "gemma4": "gemma:2b",
  "gemma4:latest": "gemma:2b",
  "gemma:latest": "gemma:2b",
  "hf.co/google/gemma-4-e4b": "gemma:2b",
  "google/gemma-4-e4b": "gemma:2b",
  "gemma-4-e4b": "gemma:2b",
  "gemma4:e4b": "gemma:2b",
  "hf.co/microsoft/phi-4-mini-flash-reasoning": "phi4-mini",
  "microsoft/phi-4-mini-flash-reasoning": "phi4-mini",
  "phi-4-mini-flash-reasoning": "phi4-mini",
  "hf.co/meta-llama/llama-3.2-1b": "llama3.2:1b",
  "meta-llama/llama-3.2-1b": "llama3.2:1b",
  "llama-3.2-1b": "llama3.2:1b",
}

DEFAULT_CHOICE_OLLAMA_MODELS: tuple[ModelInfo, ...] = (
  ModelInfo(
    id="ollama:gemma:2b",
    name="Gemma 2B (google/gemma-2b)",
    provider="ollama",
    is_local=True,
    processor_type="OLLAMA",
    status="connected",
    backend_engine="ollama",
  ),
  ModelInfo(
    id="ollama:phi4-mini",
    name="Phi-4 Mini Flash Reasoning (microsoft/Phi-4-mini-flash-reasoning)",
    provider="ollama",
    is_local=True,
    processor_type="OLLAMA",
    status="connected",
    backend_engine="ollama",
  ),
  ModelInfo(
    id="ollama:llama3.2:1b",
    name="Llama 3.2 1B (meta-llama/Llama-3.2-1B)",
    provider="ollama",
    is_local=True,
    processor_type="OLLAMA",
    status="connected",
    backend_engine="ollama",
  ),
)

_LIGHTWEIGHT_OLLAMA_TAGS: frozenset[str] = frozenset(
  {
    "gemma:2b",
    "gemma4:e4b",
    "phi4-mini",
    "llama3.2:1b",
    "llama3.2:3b",
    "qwen2.5:0.5b",
    "qwen2.5:1.5b",
    "qwen2.5:3b",
  }
)

_HEAVY_OLLAMA_SUBSTRINGS: tuple[str, ...] = (
  ":26b",
  ":27b",
  ":32b",
  ":34b",
  ":70b",
  ":72b",
  "26b",
  "27b",
)


def resolve_ollama_model_alias(model_name: str) -> str:
  """
  Resolves legacy non-GGUF HuggingFace repository identifiers to valid pullable Ollama model tags.

  Args:
      model_name (str): Raw Ollama model identifier (with or without `ollama:` / `ollama/` prefix).

  Returns:
      str: Canonical pullable Ollama tag (without `ollama:` prefix).
  """
  cleaned = model_name.strip().removeprefix("ollama:").removeprefix("ollama/").strip()
  return OLLAMA_CHOICE_MODEL_ALIASES.get(cleaned.lower(), cleaned)


def normalize_ollama_tag_key(model_id: str) -> str:
  """
  Normalizes an Ollama model ID or tag for deduplication and `/api/tags` matching.

  Strips `ollama:` / `ollama/` prefixes, resolves legacy choice-model aliases,
  and strips trailing `:latest` suffixes (`gemma4:latest` <-> `gemma4`).

  Args:
      model_id (str): Raw model identifier or tag string.

  Returns:
      str: Lowercase canonical Ollama tag key.
  """
  resolved = resolve_ollama_model_alias(model_id).lower()
  if resolved.endswith(":latest"):
    resolved = resolved[:-7]
  return resolved


def _ollama_model_sort_key(model: ModelInfo) -> tuple[int, str]:
  """
  Computes a sort priority key for local Ollama models so lightweight CPU-friendly models
  (`gemma:2b`, `llama3.2:1b`, `phi4-mini`) appear before 26B/27B parameter models (`gemma2:27b`, `gemma4:26b`).

  Args:
      model (ModelInfo): Candidate Ollama `ModelInfo` record.

  Returns:
      tuple[int, str]: `(priority_tier, normalized_tag)` where lower `priority_tier` sorts first.
  """
  norm = normalize_ollama_tag_key(model.id)
  if norm in _LIGHTWEIGHT_OLLAMA_TAGS or any(s in norm for s in (":1b", ":2b", ":3b", "mini")):
    return (0, norm)
  if any(heavy in norm for heavy in _HEAVY_OLLAMA_SUBSTRINGS):
    return (2, norm)
  return (1, norm)


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
  Guards against filesystem directory paths (such as `/mnt/data/ollama_models`) and normalizes
  legacy Ollama choice-model aliases.

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

  if _is_filesystem_path(cleaned):
    return None

  colon_idx = cleaned.find(":")
  slash_idx = cleaned.find("/")
  if colon_idx > 0 and (slash_idx == -1 or colon_idx < slash_idx):
    sep = ":"
  elif slash_idx > 0:
    sep = "/"
  else:
    return None

  provider, model_name = [part.strip() for part in cleaned.split(sep, 1)]
  if not provider or not model_name or _is_filesystem_path(model_name):
    return None
  prov_lower = provider.lower()
  if prov_lower in {"gemma-4-sql", "gemma_4_sql", "gemma4sql"}:
    prov_lower = "gemma4sql"
  elif prov_lower == "google":
    prov_lower = "gemini"
  elif prov_lower == "ollama":
    model_name = resolve_ollama_model_alias(model_name)

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


def _has_effective_cloud_api_key(
  provider: str,
  admin_settings: AdminSettingsResponse | None = None,
  explicit_key: JsonPrimitive = None,
) -> bool:
  """
  Checks whether a cloud `any-llm` provider has an effective API key configured.

  Args:
      provider (str): Provider slug (e.g. `'openai'`, `'gemini'`, `'anthropic'`, `'mistral'`).
      admin_settings (AdminSettingsResponse | None): Optional admin configuration containing `api_keys`.
      explicit_key (JsonPrimitive): Optional API key or boolean flag from a swarm entry.

  Returns:
      bool: True if a non-empty API key is configured for `provider`.
  """
  prov_lower = provider.lower().strip()
  if explicit_key and str(explicit_key).strip() not in {"", "EMPTY", "None", "false", "False"}:
    return True
  keys = (admin_settings.api_keys if admin_settings and admin_settings.api_keys else {}) or {}
  if keys.get(prov_lower) or keys.get(f"{prov_lower.upper()}_API_KEY") or (prov_lower == "gemini" and keys.get("google")):
    return True
  return bool(settings.get_provider_api_key(prov_lower))


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
  api_base = (
    admin_settings.gemma4_sql_api_base
    if admin_settings and admin_settings.gemma4_sql_api_base
    else settings.GEMMA4_SQL_API_BASE
  )
  is_enabled = (
    bool(admin_settings.gemma4_sql_enabled) if admin_settings is not None else bool(settings.GEMMA4_SQL_ENABLED)
  )
  valid_backends = {"mlx", "jax", "pytorch", "keras", "maxtext", "api"}
  is_configured = is_enabled and backend.lower() in valid_backends and (backend.lower() != "api" or bool(api_base))
  return ModelInfo(
    id=f"gemma4sql:{model_name}",
    name=f"Gemma-4-SQL ({backend.upper()})",
    provider="gemma4sql",
    is_local=True,
    processor_type="GEMMA_4_SQL",
    status="connected" if is_configured else "unconfigured",
    error_message=None if is_configured else "gemma-4-sql processor is disabled or missing endpoint configuration",
    supports_sql_generation=True,
    supports_streaming=True,
    backend_engine=backend,
  )


async def discover_ollama_models_result(
  ollama_api_base: str | None = None,
  http_client: httpx.AsyncClient | None = None,
) -> AppResult[list[ModelInfo]]:
  """
  Queries the Ollama `/api/tags` endpoint to dynamically discover locally available Ollama models,
  prioritizing lightweight CPU-compatible models ahead of 26B/27B parameter models.

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
  client = http_client if http_client is not None else llm_mod.httpx.AsyncClient(timeout=3.0)
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
        model_name = resolve_ollama_model_alias(str(item["name"]).strip())
        if _is_filesystem_path(model_name):
          continue
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
    discovered.sort(key=_ollama_model_sort_key)
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


def _matches_visible_filter(model_id: str, visible_filter: set[str] | None) -> bool:
  """
  Checks whether `model_id` (or its normalized Ollama alias/tag) is permitted by `visible_filter`.

  Args:
      model_id (str): Candidate model identifier.
      visible_filter (set[str] | None): Optional set of allowed model IDs.

  Returns:
      bool: True if allowed by `visible_filter`.
  """
  if not visible_filter:
    return True
  if model_id in visible_filter or model_id.replace(":", "/") in visible_filter:
    return True
  if model_id.lower().startswith(("ollama:", "ollama/")):
    norm_target = normalize_ollama_tag_key(model_id)
    for vis in visible_filter:
      if (
        vis.lower().startswith(("ollama:", "ollama/")) or vis.lower() in OLLAMA_CHOICE_MODEL_ALIASES
      ) and normalize_ollama_tag_key(vis) == norm_target:
        return True
  return False


def _append_unique_models(
  target: list[ModelInfo],
  seen: set[str],
  candidates: Sequence[ModelInfo],
  visible_filter: set[str] | None = None,
) -> None:
  """
  Appends `candidates` to `target` while deduplicating normalized IDs (`:` vs `/` and `:latest`) and applying `visible_filter`.

  Args:
      target (list[ModelInfo]): Destination list of `ModelInfo` items.
      seen (set[str]): Set of already-included raw and normalized model identifiers.
      candidates (Sequence[ModelInfo]): Candidate `ModelInfo` items to append.
      visible_filter (set[str] | None): Optional visibility whitelist.
  """
  for model in candidates:
    if not _matches_visible_filter(model.id, visible_filter):
      continue
    norm_key = model.id.replace(":", "/")
    ollama_tag_key = (
      f"ollama:{normalize_ollama_tag_key(model.id)}"
      if model.provider == "ollama" or model.id.lower().startswith(("ollama:", "ollama/"))
      else norm_key
    )
    if model.id not in seen and norm_key not in seen and ollama_tag_key not in seen:
      target.append(model)
      seen.add(model.id)
      seen.add(norm_key)
      seen.add(ollama_tag_key)


def _evaluate_candidate_availability(
  raw_id: str,
  name: str,
  prov: str,
  is_loc: bool,
  discovered_tag_keys: set[str] | None,
  admin_settings: AdminSettingsResponse | None,
  explicit_api_key: JsonPrimitive,
  show_all: bool,
) -> ModelInfo | None:
  """
  Evaluates whether a candidate model is connected, unconfigured, or missing in local Ollama.

  Args:
      raw_id (str): Candidate model identifier.
      name (str): Display name for the model.
      prov (str): Provider slug.
      is_loc (bool): Whether the model executes locally.
      discovered_tag_keys (set[str] | None): Normalized tag keys discovered from `/api/tags`, or `None` if discovery was not run.
      admin_settings (AdminSettingsResponse | None): Optional admin settings.
      explicit_api_key (JsonPrimitive): Optional API key or flag from the swarm configuration.
      show_all (bool): Whether to include unavailable models with `'unconfigured'`/`'error'` status.

  Returns:
      ModelInfo | None: Validated `ModelInfo` entry, or `None` when excluded by `show_all=False`.
  """
  raw_model_part = raw_id.split("/", 1)[-1].split(":", 1)[-1] if ("/" in raw_id or ":" in raw_id) else raw_id
  is_ollama = prov == "ollama" or raw_id.lower().startswith(("ollama:", "ollama/")) or (is_loc and prov == "openai")
  if is_ollama:
    prov = "ollama"
    is_loc = True
    raw_id = f"ollama:{resolve_ollama_model_alias(raw_model_part)}"
    if discovered_tag_keys is not None and normalize_ollama_tag_key(raw_id) not in discovered_tag_keys:
      if not show_all:
        return None
      return ModelInfo(
        id=raw_id,
        name=name,
        provider="ollama",
        is_local=True,
        processor_type="OLLAMA",
        status="error",
        error_message="Model not pulled in local Ollama",
        backend_engine="ollama",
      )

  elif prov == "gemma4sql" or raw_id.lower().startswith("gemma4sql"):
    gemma_info = build_gemma4_sql_model_info(admin_settings)
    if gemma_info.status != "connected":
      if not show_all:
        return None
      return ModelInfo(
        id=raw_id,
        name=name,
        provider="gemma4sql",
        is_local=True,
        processor_type="GEMMA_4_SQL",
        status=gemma_info.status,
        error_message=gemma_info.error_message,
        backend_engine=gemma_info.backend_engine,
      )

  elif not is_loc and prov not in {"ollama", "gemma4sql", "llamacpp", "sql", "mock"}:
    if not _has_effective_cloud_api_key(prov, admin_settings, explicit_key=explicit_api_key):
      if not show_all:
        return None
      return ModelInfo(
        id=raw_id,
        name=name,
        provider=prov,
        is_local=False,
        processor_type=_infer_processor_type(prov, raw_id, False),
        status="unconfigured",
        error_message=f"No API key configured for provider '{prov}'",
        backend_engine=prov,
      )

  return ModelInfo(
    id=raw_id,
    name=name,
    provider=prov,
    is_local=is_loc,
    processor_type=_infer_processor_type(prov, raw_id, is_loc),
    status="connected",
    backend_engine=prov,
  )


def _collect_swarm_and_configured_models(
  swarm_entries: Sequence[Mapping[str, JsonPrimitive]],
  admin_settings: AdminSettingsResponse | None,
  discovered_tag_keys: set[str] | None,
  show_all: bool,
) -> list[ModelInfo]:
  """
  Collects and validates candidate models from `swarm_entries` and `admin_settings.configured_models`.

  Args:
      swarm_entries (Sequence[Mapping[str, JsonPrimitive]]): Active swarm combatant dictionaries.
      admin_settings (AdminSettingsResponse | None): Optional admin configuration.
      discovered_tag_keys (set[str] | None): Discovered Ollama tag keys, or `None` if discovery was not run.
      show_all (bool): Whether to include unavailable/unconfigured models.

  Returns:
      list[ModelInfo]: Validated swarm and extra configured `ModelInfo` items.
  """
  swarm_models: list[ModelInfo] = []
  for m in swarm_entries:
    raw_id = str(m["id"]).strip()
    raw_model_part = raw_id.split("/", 1)[-1].split(":", 1)[-1] if ("/" in raw_id or ":" in raw_id) else raw_id
    if _is_filesystem_path(raw_id) or _is_filesystem_path(raw_model_part):
      continue
    evaluated = _evaluate_candidate_availability(
      raw_id=raw_id,
      name=str(m["name"]),
      prov=str(m["provider"]),
      is_loc=bool(m.get("is_local", False)),
      discovered_tag_keys=discovered_tag_keys,
      admin_settings=admin_settings,
      explicit_api_key=m.get("api_key") or m.get("has_api_key"),
      show_all=show_all,
    )
    if evaluated is not None:
      swarm_models.append(evaluated)

  extra_entries = admin_settings.configured_models if admin_settings and admin_settings.configured_models else []
  for extra_entry in extra_entries:
    parsed = _parse_configured_model_entry(extra_entry)
    if parsed is None:
      continue
    prov, mod_name, disp_name = parsed
    cand_id = f"{prov}:{mod_name}"
    if any(existing.id in {cand_id, f"{prov}/{mod_name}"} for existing in swarm_models):
      continue
    evaluated_extra = _evaluate_candidate_availability(
      raw_id=cand_id,
      name=disp_name,
      prov=prov,
      is_loc=prov in {"ollama", "gemma4sql", "llamacpp"},
      discovered_tag_keys=discovered_tag_keys,
      admin_settings=admin_settings,
      explicit_api_key=None,
      show_all=show_all,
    )
    if evaluated_extra is not None:
      swarm_models.append(evaluated_extra)
  return swarm_models


def _resolve_visible_filter(
  admin_settings: AdminSettingsResponse | None,
  show_all: bool,
  all_llm_candidates: Sequence[ModelInfo],
) -> set[str] | None:
  """
  Resolves the active `visible_models` set, falling back to `None` when persisted IDs are all stale/uninstalled.

  Args:
      admin_settings (AdminSettingsResponse | None): Optional admin configuration.
      show_all (bool): Whether visibility filtering is bypassed.
      all_llm_candidates (Sequence[ModelInfo]): All candidate LLM models before visibility filtering.

  Returns:
      set[str] | None: Active visibility whitelist or `None`.
  """
  if show_all or not admin_settings or not admin_settings.visible_models:
    return None
  visible_set = set(admin_settings.visible_models)
  if visible_set == {"SQL"} or not all_llm_candidates:
    return visible_set
  if not any(_matches_visible_filter(m.id, visible_set) for m in all_llm_candidates):
    return None
  return visible_set


def assemble_available_models(
  swarm_entries: Sequence[Mapping[str, JsonPrimitive]],
  admin_settings: AdminSettingsResponse | None = None,
  include_sql: bool = False,
  discovered_ollama: list[ModelInfo] | None = None,
  show_all: bool = False,
) -> list[ModelInfo]:
  """
  Assembles and deduplicates available `ModelInfo` records from swarm entries, admin settings, and Ollama discovery.

  When `discovered_ollama` is provided (from `GET /api/tags`), `DEFAULT_CHOICE_OLLAMA_MODELS` and local Ollama
  swarm/configured models are strictly cross-checked against the actually installed tags so unpulled models are
  filtered out (or marked `status="error"` when `show_all=True`). Cloud `any-llm` models lacking a configured API key
  are excluded when `show_all=False` and marked `status="unconfigured"` when `show_all=True`.

  Args:
      swarm_entries (Sequence[Mapping[str, JsonPrimitive]]): Active swarm combatant dictionaries.
      admin_settings (AdminSettingsResponse | None): Optional admin configuration to filter models by visibility.
      include_sql (bool): Whether to prepend the `SQL [no model]` processor option.
      discovered_ollama (list[ModelInfo] | None): Optional list of dynamically discovered Ollama models.
      show_all (bool): Whether to return unconfigured/unavailable models with non-connected status.

  Returns:
      list[ModelInfo]: Deduplicated list of configured model/processor information objects.
  """
  sorted_discovered = sorted(
    [
      m
      for m in (discovered_ollama or [])
      if not _is_filesystem_path(m.id.removeprefix("ollama:").removeprefix("ollama/"))
    ],
    key=_ollama_model_sort_key,
  )
  discovered_tag_keys: set[str] | None = (
    {normalize_ollama_tag_key(m.id) for m in sorted_discovered} if discovered_ollama is not None else None
  )

  swarm_models = _collect_swarm_and_configured_models(
    swarm_entries=swarm_entries,
    admin_settings=admin_settings,
    discovered_tag_keys=discovered_tag_keys,
    show_all=show_all,
  )

  choice_candidates: list[ModelInfo] = []
  if include_sql:
    choice_candidates = (
      [c for c in DEFAULT_CHOICE_OLLAMA_MODELS if normalize_ollama_tag_key(c.id) in discovered_tag_keys]
      if discovered_tag_keys is not None
      else list(DEFAULT_CHOICE_OLLAMA_MODELS)
    )

  visible_set = _resolve_visible_filter(
    admin_settings=admin_settings,
    show_all=show_all,
    all_llm_candidates=[*choice_candidates, *sorted_discovered, *swarm_models],
  )

  combined: list[ModelInfo] = []
  seen: set[str] = set()

  if include_sql and _matches_visible_filter(SQL_NO_MODEL_INFO.id, visible_set):
    combined.append(SQL_NO_MODEL_INFO)
    seen.add(SQL_NO_MODEL_INFO.id)

  if include_sql:
    _append_unique_models(combined, seen, choice_candidates, visible_filter=visible_set)

  _append_unique_models(combined, seen, sorted_discovered, visible_filter=visible_set)
  _append_unique_models(combined, seen, swarm_models, visible_filter=visible_set)

  return combined
