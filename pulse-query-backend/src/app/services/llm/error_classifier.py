"""
LLM Provider Error Classification and Crash Diagnostics Module.

Inspects raw exceptions and HTTP error strings from `any-llm`, `httpx`, Ollama,
`llama-server`, `gemma-4-sql`, and cloud providers (Gemini, OpenAI, Anthropic, Mistral, etc.)
to produce strongly-typed `AppError` domain errors with actionable remediation hints.
"""

from __future__ import annotations

import re

from app.core.result import AppError, ErrorCode

_CRASH_INDICATORS: tuple[str, ...] = (
  "segmentation fault",
  "core dumped",
  "llama-server process has terminated",
  "runner process has terminated",
  "signal: sigsegv",
  "signal: sigabrt",
  "signal: sigkill",
  "out of memory",
  "cuda error",
  "ggml_assert",
)

_CONNECTION_REFUSED_INDICATORS: tuple[str, ...] = (
  "connection refused",
  "connection error",
  "connect error",
  "connecterror",
  "apiconnectionerror",
  "apitimeouterror",
  "readtimeout",
  "writetimeout",
  "pooltimeout",
  "connecttimeout",
  "remoteprotocolerror",
  "server disconnected",
  "connection reset",
  "broken pipe",
  "failed to connect to ollama",
  "all connection attempts failed",
  "failed to establish a new connection",
  "name or service not known",
  "nodename nor servname provided",
  "network is unreachable",
  "timed out",
  "timeout",
)

_PRECLASSIFIED_PREFIX_PATTERNS: tuple[re.Pattern[str], ...] = (
  re.compile(r"^Error:\s+(?=\S)", re.IGNORECASE),
  re.compile(r"^Provider\s+'[^']*'\s*(?:\([^)]*\)\s*)?error:\s+(?=\S)", re.IGNORECASE),
  re.compile(r"^Cannot\s+connect\s+to\s+provider\s+'[^']*'\s+for\s+model\s+'[^']*':\s+(?=\S)", re.IGNORECASE),
  re.compile(r"^Local\s+model\s+'[^']*'\s*(?:\([^)]*\)\s*)?process\s+crashed:\s+(?=\S)", re.IGNORECASE),
  re.compile(r"^Authentication\s+failed\s+for\s+'[^']*'\s*(?:\([^)]*\))?:\s+(?=\S)", re.IGNORECASE),
  re.compile(r"^Model\s+'[^']*'\s+was\s+not\s+found\s+on\s+provider\s+'[^']*':\s+(?=\S)", re.IGNORECASE),
  re.compile(r"^Quota\s+or\s+rate\s+limit\s+exceeded\s+for\s+'[^']*'\s*(?:\([^)]*\))?:\s+(?=\S)", re.IGNORECASE),
)


def _unwrap_preclassified_error_text(raw_text: str) -> str:
  """
  Unwraps already-formatted `classify_llm_error` messages and strips trailing `| Remediation:` suffixes
  so downstream callers never double-wrap provider error prefixes.

  Args:
      raw_text (str): Raw or previously classified error text.

  Returns:
      str: Inner unwrapped error message string.
  """
  cleaned = raw_text.split(" | Remediation:", 1)[0].strip()
  changed = True
  while changed and cleaned:
    changed = False
    for pattern in _PRECLASSIFIED_PREFIX_PATTERNS:
      match = pattern.match(cleaned)
      if match:
        cleaned = cleaned[match.end() :].strip()
        changed = True
  return cleaned or raw_text


_AUTH_ERROR_INDICATORS: tuple[str, ...] = (
  "401",
  "403",
  "unauthorized",
  "invalid_api_key",
  "invalid api key",
  "authenticationerror",
  "permission_denied",
  "api_key_invalid",
  "incorrect api key",
)

_NOT_FOUND_INDICATORS: tuple[str, ...] = (
  "404",
  "model not found",
  "not_found_error",
  "does not exist",
  "try pulling it first",
  "unknown backend",
)

_QUOTA_INDICATORS: tuple[str, ...] = (
  "429",
  "rate limit",
  "ratelimit",
  "resource_exhausted",
  "quota exceeded",
  "insufficient_quota",
)


def classify_llm_error(
  provider: str,
  model: str,
  raw_error: BaseException | str,
) -> AppError:
  """
  Classifies a raw LLM provider exception or error string into a structured `AppError`.

  Detects local `llama-server` / Ollama segmentation faults (`SIGSEGV`), connection failures,
  invalid API keys (`401`/`403`), missing models (`404`), and quota limits (`429`).

  Args:
      provider (str): Provider slug (e.g., `'ollama'`, `'gemini'`, `'openai'`, `'gemma4sql'`).
      model (str): Target model identifier.
      raw_error (BaseException | str): Caught exception or raw error message string.

  Returns:
      AppError: Structured domain error with `ErrorCode`, human-readable message, and `remediation` details.
  """
  initial_text = str(raw_error).strip() or (
    type(raw_error).__name__ if isinstance(raw_error, BaseException) else "Unknown"
  )
  raw_text = _unwrap_preclassified_error_text(initial_text)
  lower_text = raw_text.lower()
  prov_clean = provider.strip() or "llm"
  model_clean = model.strip() or "unknown"

  if any(marker in lower_text for marker in _CRASH_INDICATORS):
    remediation = (
      "The local inference runner (llama-server / Ollama) crashed with a segmentation fault or memory error. "
      "1) Select a single local model at a time to avoid concurrent model loading. "
      "2) Restart Ollama (`ollama serve`) or pull a smaller quantization (e.g. Q4_K_M). "
      "3) Switch to gemma-4-sql or a cloud provider like Gemini if local RAM/VRAM is constrained."
    )
    return AppError(
      code=ErrorCode.LLM_LOCAL_PROCESS_CRASHED,
      message=f"Local model '{model_clean}' ({prov_clean}) process crashed: {raw_text}",
      status_code=502,
      details={
        "provider": prov_clean,
        "model": model_clean,
        "raw_error": raw_text,
        "remediation": remediation,
      },
    )

  if any(marker in lower_text for marker in _CONNECTION_REFUSED_INDICATORS):
    remediation = (
      f"Ensure the '{prov_clean}' endpoint is running and reachable (e.g., `ollama serve` on http://localhost:11434 "
      "or verify the custom API base URL in Admin Settings)."
    )
    return AppError(
      code=ErrorCode.LLM_CONNECTION_REFUSED,
      message=f"Cannot connect to provider '{prov_clean}' for model '{model_clean}': {raw_text}",
      status_code=503,
      details={
        "provider": prov_clean,
        "model": model_clean,
        "raw_error": raw_text,
        "remediation": remediation,
      },
    )

  if any(marker in lower_text for marker in _AUTH_ERROR_INDICATORS):
    remediation = (
      f"Configure a valid API key for '{prov_clean}' in Admin Settings or `.env` (e.g. {prov_clean.upper()}_API_KEY)."
    )
    return AppError(
      code=ErrorCode.LLM_AUTH_INVALID,
      message=f"Authentication failed for '{prov_clean}' ({model_clean}): {raw_text}",
      status_code=401,
      details={
        "provider": prov_clean,
        "model": model_clean,
        "raw_error": raw_text,
        "remediation": remediation,
      },
    )

  if any(marker in lower_text for marker in _NOT_FOUND_INDICATORS):
    remediation = (
      f"Verify that model '{model_clean}' exists on '{prov_clean}'. "
      f"For Ollama, run `ollama pull {model_clean.removeprefix('ollama:').removeprefix('ollama/')}`."
    )
    return AppError(
      code=ErrorCode.LLM_MODEL_NOT_FOUND,
      message=f"Model '{model_clean}' was not found on provider '{prov_clean}': {raw_text}",
      status_code=404,
      details={
        "provider": prov_clean,
        "model": model_clean,
        "raw_error": raw_text,
        "remediation": remediation,
      },
    )

  if any(marker in lower_text for marker in _QUOTA_INDICATORS):
    remediation = (
      f"Provider '{prov_clean}' rate limit or quota exceeded. Wait briefly, check billing quota, "
      "or select an alternative model in the Chat model selector."
    )
    return AppError(
      code=ErrorCode.LLM_QUOTA_EXCEEDED,
      message=f"Quota or rate limit exceeded for '{prov_clean}' ({model_clean}): {raw_text}",
      status_code=429,
      details={
        "provider": prov_clean,
        "model": model_clean,
        "raw_error": raw_text,
        "remediation": remediation,
      },
    )

  remediation = f"Check provider logs and configuration for '{prov_clean}' ({model_clean}) in Admin Settings."
  return AppError(
    code=ErrorCode.LLM_PROVIDER_ERROR,
    message=f"Provider '{prov_clean}' ({model_clean}) error: {raw_text}",
    status_code=502,
    details={
      "provider": prov_clean,
      "model": model_clean,
      "raw_error": raw_text,
      "remediation": remediation,
    },
  )


def format_classified_error_markdown(app_err: AppError) -> str:
  """
  Formats a classified `AppError` into a clean, user-friendly Markdown diagnostic block for chat candidates.

  Args:
      app_err (AppError): Classified domain error from `classify_llm_error`.

  Returns:
      str: Markdown-formatted diagnostic message including error code and remediation advice.
  """
  nl = chr(10)
  remediation = str(app_err.details.get("remediation") or "").strip()
  base = f"**Generation Failed (`{app_err.code}`)**{nl}Error: {app_err.message}"
  if remediation:
    return f"{base}{nl}{nl}**Remediation:** {remediation}"
  return base


__all__ = ["classify_llm_error", "format_classified_error_markdown"]
