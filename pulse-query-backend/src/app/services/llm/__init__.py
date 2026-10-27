"""
Sub-package containing LLM fallback mock providers and local Ollama model discovery utilities.
"""

from app.services.llm.discovery import (
  SQL_NO_MODEL_INFO,
  _infer_processor_type,
  _normalize_ollama_root_url,
  _parse_configured_model_entry,
  assemble_available_models,
  discover_ollama_models_result,
)
from app.services.llm.fallback_mock import (
  FallbackMockProvider,
  build_streaming_error_fallback_sql,
  build_streaming_mock_sql_response,
)

__all__ = [
  "FallbackMockProvider",
  "SQL_NO_MODEL_INFO",
  "_infer_processor_type",
  "_normalize_ollama_root_url",
  "_parse_configured_model_entry",
  "assemble_available_models",
  "build_streaming_error_fallback_sql",
  "build_streaming_mock_sql_response",
  "discover_ollama_models_result",
]
