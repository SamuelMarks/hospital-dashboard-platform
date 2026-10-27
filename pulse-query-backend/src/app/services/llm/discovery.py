"""
Ollama and local model auto-discovery utilities and processor metadata helpers.
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

  sep = ":" if ":" in cleaned else ("/" if "/" in cleaned else "")
  if not sep:
    return None
  provider, model_name = [part.strip() for part in cleaned.split(sep, 1)]
  if not provider or not model_name:
    return None
  display_name = display_override if display_override else f"{model_name} ({provider})"
  return provider.lower(), model_name, display_name


def _infer_processor_type(provider: str, model_id: str, is_local: bool) -> ProcessorType:
  """
  Infers the `ProcessorType` category for a given provider and model identifier.

  Args:
      provider (str): Provider slug.
      model_id (str): Model identifier string.
      is_local (bool): Whether the model is marked as local.

  Returns:
      ProcessorType: `'SQL'`, `'OLLAMA'`, or `'ANY_LLM'`.
  """
  if model_id.upper() == "SQL" or provider.lower() == "sql":
    return "SQL"
  if provider.lower() == "ollama" or model_id.lower().startswith(("ollama/", "ollama:")) or is_local:
    return "OLLAMA"
  return "ANY_LLM"


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
    )
    for m in swarm_entries
  ]
  if admin_settings and admin_settings.visible_models:
    swarm_models = [m for m in swarm_models if m.id in admin_settings.visible_models]

  for extra_entry in admin_settings.configured_models if admin_settings and admin_settings.configured_models else []:
    parsed = _parse_configured_model_entry(extra_entry)
    if parsed is not None:
      prov, mod_name, disp_name = parsed
      is_loc = prov == "ollama"
      cand_id = f"{prov}:{mod_name}"
      if all(existing.id not in {cand_id, f"{prov}/{mod_name}"} for existing in swarm_models):
        swarm_models.append(
          ModelInfo(
            id=cand_id,
            name=disp_name,
            provider=prov,
            is_local=is_loc,
            processor_type=_infer_processor_type(prov, cand_id, is_loc),
          )
        )

  combined: list[ModelInfo] = []
  seen: set[str] = set()

  if include_sql:
    combined.append(SQL_NO_MODEL_INFO)
    seen.add(SQL_NO_MODEL_INFO.id)

  for ollama_model in discovered_ollama or []:
    norm_key = ollama_model.id.replace(":", "/")
    if ollama_model.id not in seen and norm_key not in seen:
      combined.append(ollama_model)
      seen.add(ollama_model.id)
      seen.add(norm_key)

  for model in swarm_models:
    norm_key = model.id.replace(":", "/")
    if model.id not in seen and norm_key not in seen:
      combined.append(model)
      seen.add(model.id)
      seen.add(norm_key)

  return combined
