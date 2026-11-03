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
      if vis.lower().startswith(("ollama:", "ollama/")) and normalize_ollama_tag_key(vis) == norm_target:
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


def assemble_available_models(
  swarm_entries: Sequence[Mapping[str, JsonPrimitive]],
  admin_settings: AdminSettingsResponse | None = None,
  include_sql: bool = False,
  discovered_ollama: list[ModelInfo] | None = None,
) -> list[ModelInfo]:
  """
  Assembles and deduplicates available `ModelInfo` records from swarm entries, admin settings, and Ollama discovery.

  When `discovered_ollama` is non-empty (from `GET /api/tags`), `DEFAULT_CHOICE_OLLAMA_MODELS` are cross-checked
  against the actually installed tags so unpulled models are filtered out, and discovered local Ollama models
  are sorted so lightweight CPU-friendly models (`gemma:2b`, `llama3.2:1b`, `phi4-mini`) appear before 26B/27B models.

  Args:
      swarm_entries (Sequence[Mapping[str, JsonPrimitive]]): Active swarm combatant dictionaries.
      admin_settings (AdminSettingsResponse | None): Optional admin configuration to filter models by visibility.
      include_sql (bool): Whether to prepend the `SQL [no model]` processor option.
      discovered_ollama (list[ModelInfo] | None): Optional list of dynamically discovered Ollama models.

  Returns:
      list[ModelInfo]: Deduplicated list of configured model/processor information objects.
  """
  swarm_models: list[ModelInfo] = []
  for m in swarm_entries:
    raw_id = str(m["id"]).strip()
    raw_model_part = raw_id.split("/", 1)[-1].split(":", 1)[-1] if ("/" in raw_id or ":" in raw_id) else raw_id
    if _is_filesystem_path(raw_id) or _is_filesystem_path(raw_model_part):
      continue
    prov = str(m["provider"])
    is_loc = bool(m.get("is_local", False))
    if is_loc and prov in {"ollama", "openai"} and raw_id.startswith(("ollama:", "ollama/", "openai/")):
      prefix = "ollama:" if raw_id.startswith(("ollama:", "ollama/")) else f"{prov}/"
      raw_id = f"{prefix}{resolve_ollama_model_alias(raw_model_part)}"
    swarm_models.append(
      ModelInfo(
        id=raw_id,
        name=str(m["name"]),
        provider=prov,
        is_local=is_loc,
        processor_type=_infer_processor_type(prov, raw_id, is_loc),
        status="connected",
        backend_engine=prov,
      )
    )

  visible_set = set(admin_settings.visible_models) if admin_settings and admin_settings.visible_models else None
  if visible_set:
    swarm_models = [m for m in swarm_models if _matches_visible_filter(m.id, visible_set)]

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

  sorted_discovered = sorted(
    [
      m
      for m in (discovered_ollama or [])
      if not _is_filesystem_path(m.id.removeprefix("ollama:").removeprefix("ollama/"))
    ],
    key=_ollama_model_sort_key,
  )
  discovered_tag_keys = {normalize_ollama_tag_key(m.id) for m in sorted_discovered}

  if include_sql:
    choice_candidates = (
      [c for c in DEFAULT_CHOICE_OLLAMA_MODELS if normalize_ollama_tag_key(c.id) in discovered_tag_keys]
      if discovered_tag_keys
      else list(DEFAULT_CHOICE_OLLAMA_MODELS)
    )
    _append_unique_models(combined, seen, choice_candidates, visible_filter=visible_set)

  _append_unique_models(combined, seen, sorted_discovered, visible_filter=visible_set)
  _append_unique_models(combined, seen, swarm_models, visible_filter=visible_set)

  return combined
