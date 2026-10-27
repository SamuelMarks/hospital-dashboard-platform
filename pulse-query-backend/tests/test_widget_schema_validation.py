"""
Tests for Widget Schema Validation.
"""

import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.widget import HttpConfig, SqlConfig, TextConfig, WidgetCreate

WIDGET_CREATE_ADAPTER: TypeAdapter[WidgetCreate] = TypeAdapter(WidgetCreate)


def test_sql_config_valid() -> None:
  """Test standard SQL config structure."""
  model = SqlConfig.model_validate({"query": "SELECT 1", "w": 12})
  assert model.query == "SELECT 1"
  assert model.w == 12
  assert model.h == 4  # Default


def test_sql_config_missing_query() -> None:
  """Test failure when query is missing."""
  with pytest.raises(ValidationError) as exc:
    SqlConfig.model_validate({"w": 10})
  assert "query" in str(exc.value)


def test_http_config_url_validation() -> None:
  """Test URL parsing and validation."""
  # Valid
  model = HttpConfig.model_validate({"url": "https://api.com/data"})
  # Allow either variant (with or without slash) to be robust across pydantic versions
  assert str(model.url) in ["https://api.com/data/", "https://api.com/data"]

  # Invalid
  with pytest.raises(ValidationError):
    HttpConfig.model_validate({"url": "not-a-url"})


def test_polymorphic_create_sql() -> None:
  """
  Test creation of the Union model with type='SQL'.
  """
  payload = {
    "title": "My SQL Widget",
    "type": "SQL",
    "visualization": "table",
    "config": {"query": "SELECT * FROM t"},
  }
  model = WIDGET_CREATE_ADAPTER.validate_python(payload)

  assert model.type == "SQL"
  assert isinstance(model.config, SqlConfig)
  assert model.config.query == "SELECT * FROM t"


def test_polymorphic_create_http() -> None:
  """
  Test creation of the Union model with type='HTTP'.
  """
  payload = {
    "title": "My HTTP Widget",
    "type": "HTTP",
    "visualization": "metric",
    "config": {
      "url": "https://api.example.com",
      "method": "POST",
      "meta_forward_auth": True,
    },
  }
  model = WIDGET_CREATE_ADAPTER.validate_python(payload)

  assert model.type == "HTTP"
  assert isinstance(model.config, HttpConfig)
  assert model.config.method == "POST"
  assert model.config.meta_forward_auth is True


def test_polymorphic_create_text() -> None:
  """
  Test creation of the Union model with type='TEXT'.
  """
  payload = {
    "title": "Instructions",
    "type": "TEXT",
    "visualization": "markdown",
    "config": {"content": "**Bold** note"},
  }
  model = WIDGET_CREATE_ADAPTER.validate_python(payload)

  assert model.type == "TEXT"
  assert isinstance(model.config, TextConfig)
  assert model.config.content == "**Bold** note"


def test_polymorphic_discriminator_mismatch() -> None:
  """
  Test that mixing types (Type=SQL but Config=HTTP) raises a Validation Error.
  """
  payload = {
    "title": "Confused Widget",
    "type": "SQL",
    "visualization": "chart",
    "config": {"url": "https://api.com"},
  }

  with pytest.raises(ValidationError) as exc:
    WIDGET_CREATE_ADAPTER.validate_python(payload)

  errors = str(exc.value)
  assert "query" in errors


def test_sql_config_natural_text_and_processor_validation() -> None:
  """Verifies `SqlConfig` natural text mode, processor validation, and prompt fallback."""
  # 1. allow_natural_text=True with LLM processor and no initial query
  cfg_llm = SqlConfig.model_validate(
    {
      "allow_natural_text": True,
      "processor": "ollama:llama3",
      "natural_text_prompt": "Show total admissions by service",
      "placeholder_text": "Ask a question...",
    }
  )
  assert cfg_llm.query == ""
  assert cfg_llm.processor == "ollama:llama3"
  assert cfg_llm.allow_natural_text is True

  # 2. allow_natural_text=True with SQL processor uses natural_text_prompt when query is omitted
  cfg_sql_prompt = SqlConfig.model_validate(
    {
      "allow_natural_text": True,
      "processor": "SQL",
      "natural_text_prompt": "SELECT 1 AS c",
    }
  )
  assert cfg_sql_prompt.query == "SELECT 1 AS c"

  # 2b. allow_natural_text=True with explicit non-empty query preserves query
  cfg_with_query = SqlConfig.model_validate(
    {
      "query": "SELECT 2 AS c",
      "allow_natural_text": True,
      "processor": "ollama:llama3",
    }
  )
  assert cfg_with_query.query == "SELECT 2 AS c"

  # 3. Invalid processor identifier raises ValidationError
  with pytest.raises(ValidationError) as exc_proc:
    SqlConfig.model_validate({"query": "SELECT 1", "processor": "invalid_processor_without_colon"})
  assert "Invalid processor identifier" in str(exc_proc.value)

  with pytest.raises(ValidationError):
    SqlConfig.model_validate({"query": "SELECT 1", "processor": "openai:"})


def test_polymorphic_invalid_http_method() -> None:
  """Test validation of nested enum fields."""
  payload = {
    "title": "Bad Method",
    "type": "HTTP",
    "visualization": "table",
    "config": {"url": "https://a.com", "method": "JUMP"},
  }

  with pytest.raises(ValidationError) as exc:
    WIDGET_CREATE_ADAPTER.validate_python(payload)

  assert "Input should be 'GET', 'POST'" in str(exc.value)
