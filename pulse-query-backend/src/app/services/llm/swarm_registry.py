"""
Swarm Configuration Normalization Module for `LLMArenaClient`.

Extracts swarm configuration normalization and dynamic combatant resolution out of
`llm_client.py` to maintain single-responsibility boundaries.
"""

from __future__ import annotations

from app.core.config import settings
from app.schemas.json_types import JsonPrimitive
from app.services.llm.discovery import (
  _normalize_ollama_root_url,
  _parse_configured_model_entry,
  resolve_ollama_model_alias,
)


def build_raw_swarm_configs(
  keys: dict[str, str],
  configured_models: list[str] | None,
  ollama_api_base: str | None,
  gemma4_sql_enabled: bool | None,
  gemma4_sql_backend: str | None,
  gemma4_sql_model_name: str | None,
  gemma4_sql_api_base: str | None,
) -> list[dict[str, JsonPrimitive]]:
  """
  Builds the normalized list of raw swarm configuration dictionaries from `settings.LLM_SWARM` and overrides.

  Args:
      keys (dict[str, str]): Custom API keys mapping.
      configured_models (list[str] | None): Additional `provider:model` entries.
      ollama_api_base (str | None): Optional custom Ollama base URL.
      gemma4_sql_enabled (bool | None): Optional explicit enable flag for `gemma-4-sql`.
      gemma4_sql_backend (str | None): Optional `gemma-4-sql` backend engine override.
      gemma4_sql_model_name (str | None): Optional `gemma-4-sql` model identifier override.
      gemma4_sql_api_base (str | None): Optional `gemma-4-sql serve` HTTP URL override.

  Returns:
      list[dict[str, JsonPrimitive]]: Normalized configuration dictionaries.
  """
  raw_configs: list[dict[str, JsonPrimitive]] = []
  for c in settings.LLM_SWARM:
    is_ollama_cfg = c.get("api_key") == "ollama" or str(c.get("provider") or "").lower() == "ollama"
    raw_mod = str(c.get("model_name") or c.get("model") or "")
    norm_mod = resolve_ollama_model_alias(raw_mod) if is_ollama_cfg else str(c.get("model") or "")
    norm_mod_name = resolve_ollama_model_alias(raw_mod) if is_ollama_cfg else raw_mod
    raw_configs.append(
      {
        "provider": c.get("provider"),
        "model": norm_mod,
        "api_key": c.get("api_key"),
        "api_base": str(c.get("api_base") or c.get("base_url") or "") or None,
        "name": c.get("name"),
        "model_name": norm_mod_name,
        "is_local": bool(c.get("is_local", c.get("local", False))),
      }
    )

  if gemma4_sql_enabled is True:
    g_backend = gemma4_sql_backend or settings.GEMMA4_SQL_BACKEND
    g_model = gemma4_sql_model_name or settings.GEMMA4_SQL_MODEL_NAME
    raw_configs.append(
      {
        "provider": "gemma4sql",
        "logical_provider": "gemma4sql",
        "model": g_model,
        "model_name": g_model,
        "name": f"Gemma-4-SQL ({g_backend.upper()})",
        "api_key": g_backend,
        "api_base": gemma4_sql_api_base or settings.GEMMA4_SQL_API_BASE,
        "is_local": True,
      }
    )

  for entry in configured_models or []:
    parsed = _parse_configured_model_entry(entry)
    if parsed is not None:
      prov, mod_name, disp_name = parsed
      is_ollama = prov == "ollama"
      is_gemma4 = prov == "gemma4sql"
      raw_configs.append(
        {
          "provider": "openai" if is_ollama else prov,
          "logical_provider": prov,
          "model": mod_name,
          "model_name": mod_name,
          "name": disp_name,
          "api_key": "ollama" if is_ollama else (gemma4_sql_backend or "mlx" if is_gemma4 else keys.get(prov)),
          "api_base": (
            f"{_normalize_ollama_root_url(ollama_api_base)}/v1"
            if is_ollama
            else (gemma4_sql_api_base if is_gemma4 else None)
          ),
          "is_local": is_ollama or is_gemma4,
        }
      )
  return raw_configs


__all__ = ["build_raw_swarm_configs"]
