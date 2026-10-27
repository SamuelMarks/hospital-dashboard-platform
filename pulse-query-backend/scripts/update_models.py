#!/usr/bin/env python3

"""
Model Configuration Updater.

This script inspects the local environment for available LLM providers (Ollama, API Keys)
and updates the `.env` file with a consolidated configuration.

It specifically:
1. Detects local Ollama models via CLI.
2. Generates aliases for them (formatted `id|Alias`).
3. Updates `OLLAMA_MODELS` in .env.
4. Validates API Keys for cloud providers.

Usage:
    uv run python scripts/update_models.py
"""

import os
from pathlib import Path
import re
import subprocess

# Path to the .env file relative to this script
ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def get_ollama_models() -> list[tuple[str, str]]:
  """
  Executes `ollama list` to retrieve installed models.

  Returns:
      list[tuple[str, str]]: List of `(model_id, alias)` tuples.
  """
  print("🔍 Inspecting Ollama...")
  try:
    result = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=5)

    if result.returncode != 0:
      print("   ⚠️ Ollama command failed (is it running?)")
      return []

    models: list[tuple[str, str]] = []
    lines = result.stdout.strip().splitlines()

    for line in lines[1:]:
      parts = line.split()
      if not parts:
        continue

      model_id = parts[0]
      alias = _prettify_model_name(model_id)
      models.append((model_id, alias))
      print(f"   ✅ Found: {model_id} (Alias: {alias})")

    return models

  except FileNotFoundError:
    print("   ❌ Ollama not found in PATH.")
    return []
  except Exception as e:
    print(f"   ❌ Error checking Ollama: {e}")
    return []


def _prettify_model_name(raw: str) -> str:
  """
  Heuristic for generating readable aliases from model tags.

  Args:
      raw (str): Raw Ollama model tag string (e.g., `'qwen2.5-coder:14b'`).

  Returns:
      str: Human-readable display alias.
  """
  clean = raw.replace(":latest", "")

  if ":" in clean:
    name, tag = clean.split(":", 1)
    return f"{name.title()} ({tag})"

  return clean.title().replace("-", " ")


def update_env_file(ollama_models: list[tuple[str, str]]) -> None:
  """
  Updates or creates the `.env` file with the `OLLAMA_MODELS` definition (`model_id|Alias`).

  Args:
      ollama_models (list[tuple[str, str]]): Discovered `(model_id, alias)` pairs to persist.
  """
  if not ollama_models:
    print("obs: No Ollama models to persist.")
    return

  env_value = ", ".join([f"{mid}|{alias}" for mid, alias in ollama_models])

  content = ""
  if ENV_FILE.exists():
    content = ENV_FILE.read_text(encoding="utf-8")

  pattern = r"^OLLAMA_MODELS=.*$"
  new_line = f'OLLAMA_MODELS="{env_value}"'

  nl = chr(10)
  if re.search(pattern, content, flags=re.MULTILINE):
    content = re.sub(pattern, new_line, content, flags=re.MULTILINE)
  else:
    if content and not content.endswith(nl):
      content += nl
    content += f"{new_line}{nl}"

  ENV_FILE.write_text(content, encoding="utf-8")
  print(f"💾 Updated {ENV_FILE} with {len(ollama_models)} models.")


def inspect_cloud_keys() -> None:
  """
  Checks for the presence of cloud LLM API keys in the environment and prints their status.
  """
  keys = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "MISTRAL_API_KEY", "XAI_API_KEY")

  nl = chr(10)
  print(f"{nl}🔍 cloud API Status:")
  found = False
  for k in keys:
    val = os.environ.get(k)
    if val:
      print(f"   ✅ {k}: Configured")
      found = True

  if not found:
    print("   ℹ️ No cloud API keys found in current environment.")


def main() -> None:
  """
  CLI entry point inspecting local Ollama models and cloud API keys and updating `.env`.
  """
  print("=== Pulse Query Model Updater ===")

  local_models = get_ollama_models()
  if local_models:
    update_env_file(local_models)

  inspect_cloud_keys()

  nl = chr(10)
  print(f"{nl}✅ Update complete. Restart the backend to apply changes.")


if __name__ == "__main__":
  main()
