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
import subprocess
import re
from pathlib import Path
from typing import List, Dict, Tuple

# Path to the .env file relative to this script
ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def get_ollama_models() -> List[Tuple[str, str]]:
  """
  Executes `ollama list` to retrieve installed models.
  Returns a list of (id, alias) tuples.
  """
  print("🔍 Inspecting Ollama...")
  try:
    # Check if ollama is installed and running
    result = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=5)

    if result.returncode != 0:
      print("   ⚠️ Ollama command failed (is it running?)")
      return []

    models = []
    lines = result.stdout.strip().split("\n")

    # Skip header row (NAME ID SIZE MODIFIED)
    for line in lines[1:]:
      parts = line.split()
      if not parts:
        continue

      model_id = parts[0]

      # Generate a pretty alias
      # e.g. "qwen2.5-coder:14b" -> "Qwen 2.5 Coder (14b)"
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
  """
  # Remove :latest tag as it's implied
  clean = raw.replace(":latest", "")

  # Split version tags
  if ":" in clean:
    name, tag = clean.split(":", 1)
    return f"{name.title()} ({tag})"

  return clean.title().replace("-", " ")


def update_env_file(ollama_models: List[Tuple[str, str]]) -> None:
  """
  Updates or Creates the .env file with the OLLAMA_MODELS definition.
  Persists format: `model_id|Alias`
  """
  if not ollama_models:
    print("obs: No Ollama models to persist.")
    return

  # Format the value string
  # Entry: "qwen2.5:latest|Qwen 2.5"
  env_value = ", ".join([f"{mid}|{alias}" for mid, alias in ollama_models])

  # Read existing content
  content = ""
  if ENV_FILE.exists():
    content = ENV_FILE.read_text(encoding="utf-8")

  # Regex to find existing OLLAMA_MODELS line
  pattern = r"^OLLAMA_MODELS=.*$"

  new_line = f'OLLAMA_MODELS="{env_value}"'

  if re.search(pattern, content, re.MULTILINE):
    # Replace existing
    content = re.sub(pattern, new_line, content, flags=re.MULTILINE)
  else:
    # Append to end
    if content and not content.endswith("\n"):
      content += "\n"
    content += f"{new_line}\n"

  ENV_FILE.write_text(content, encoding="utf-8")
  print(f"💾 Updated {ENV_FILE} with {len(ollama_models)} models.")


def inspect_cloud_keys() -> None:
  """
  Simply checks for presence of cloud keys in env and prints status.
  Does not write keys (security).
  """
  keys = "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "MISTRAL_API_KEY", "XAI_API_KEY"

  print("\n🔍 cloud API Status:")
  found = False
  for k in keys:
    val = os.environ.get(k)
    if val:
      print(f"   ✅ {k}: Configured")
      found = True

  if not found:
    print("   ℹ️ No cloud API keys found in current environment.")


def main():
  print("=== Pulse Query Model Updater ===")

  # 1. Ollama
  local_models = get_ollama_models()
  if local_models:
    update_env_file(local_models)

  # 2. Cloud
  inspect_cloud_keys()

  print("\n✅ Update complete. Restart the backend to apply changes.")


if __name__ == "__main__":
  main()
