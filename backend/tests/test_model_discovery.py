"""
Tests for Model Discovery Logic.

Verifies that the configuration system and update scripts handle environment details correctly.
"""

import os
from unittest.mock import patch, MagicMock
import pytest
from app.core.config import Settings
from scripts.update_models import get_ollama_models, update_env_file


def test_ollama_parsing():
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


def test_ollama_env_update(tmp_path):
  """Verify the script writes to the env file correctly."""
  env_file = tmp_path / ".env"
  env_file.write_text("DEBUG=True\n")

  # Mock the ENV_PATH in the script module
  with patch("scripts.update_models.ENV_FILE", env_file):
    mock_models = [("m1", "Model One"), ("m2", "Model Two")]

    update_env_file(mock_models)

    content = env_file.read_text()
    assert 'OLLAMA_MODELS="m1|Model One, m2|Model Two"' in content
    assert "DEBUG=True" in content

  # Test Replacement logic
  with patch("scripts.update_models.ENV_FILE", env_file):
    update_env_file([("m3", "Three")])
    content = env_file.read_text()
    assert 'OLLAMA_MODELS="m3|Three"' in content
    assert "m1" not in content
