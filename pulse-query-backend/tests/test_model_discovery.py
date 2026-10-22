"""
Tests for Model Discovery Logic.

Verifies that the configuration system and update scripts handle environment details correctly.
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from scripts.update_models import (
  get_ollama_models,
  inspect_cloud_keys,
  main,
  update_env_file,
)


def test_ollama_parsing() -> None:
  """Verify that CLI output parsing handles the standard format."""
  mock_stdout = """NAME        ID              SIZE      MODIFIED
qwen3:8b    500a1f067a9f    5.2 GB    8 months ago

llama3      abc             1.0 GB    1 day ago
"""

  with patch("scripts.update_models.subprocess.run") as mock_run:
    mock_run.return_value.stdout = mock_stdout
    mock_run.return_value.returncode = 0

    models = get_ollama_models()
    assert len(models) == 2

    # Check ID, Alias mapping
    mid0, alias0 = models[0]
    assert mid0 == "qwen3:8b"
    assert alias0 == "Qwen3 (8b)"

    mid1, alias1 = models[1]
    assert mid1 == "llama3"
    assert alias1 == "Llama3"


def test_ollama_parsing_errors() -> None:
  """Verify error handling for non-zero returncode, FileNotFoundError, and generic exceptions."""
  with patch("scripts.update_models.subprocess.run") as mock_run:
    mock_run.return_value.returncode = 1
    assert get_ollama_models() == []

  with patch("scripts.update_models.subprocess.run", side_effect=FileNotFoundError):
    assert get_ollama_models() == []

  with patch("scripts.update_models.subprocess.run", side_effect=RuntimeError("boom")):
    assert get_ollama_models() == []


def test_ollama_env_update(tmp_path: Path) -> None:
  """Verify the script writes to the env file correctly."""
  env_file = tmp_path / ".env"
  env_file.write_text("DEBUG=True")

  with patch("scripts.update_models.ENV_FILE", env_file):
    update_env_file([])
    assert env_file.read_text() == "DEBUG=True"

    mock_models = [("m1", "Model One"), ("m2", "Model Two")]
    update_env_file(mock_models)

    content = env_file.read_text()
    assert 'OLLAMA_MODELS="m1|Model One, m2|Model Two"' in content
    assert "DEBUG=True\n" in content

  # Test Replacement logic
  with patch("scripts.update_models.ENV_FILE", env_file):
    update_env_file([("m3", "Three")])
    content = env_file.read_text()
    assert 'OLLAMA_MODELS="m3|Three"' in content
    assert "m1" not in content

  # Test when .env does not exist yet
  missing_env = tmp_path / "new.env"
  with patch("scripts.update_models.ENV_FILE", missing_env):
    update_env_file([("m4", "Four")])
    assert 'OLLAMA_MODELS="m4|Four"' in missing_env.read_text()


def test_inspect_cloud_keys_and_main(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """Verify inspect_cloud_keys and main() branches with and without local models / cloud keys."""
  for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "MISTRAL_API_KEY", "XAI_API_KEY"):
    monkeypatch.delenv(k, raising=False)

  inspect_cloud_keys()

  monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
  inspect_cloud_keys()

  env_file = tmp_path / ".env"
  with (
    patch("scripts.update_models.ENV_FILE", env_file),
    patch("scripts.update_models.get_ollama_models", return_value=[("m1", "One")]),
  ):
    main()
    assert 'OLLAMA_MODELS="m1|One"' in env_file.read_text()

  with patch("scripts.update_models.get_ollama_models", return_value=[]):
    main()
