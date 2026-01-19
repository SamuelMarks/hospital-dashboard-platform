"""
Tests for Widget Schema Validation.
"""

import pytest
from pydantic import ValidationError, TypeAdapter
from app.schemas.widget import WidgetCreate, SqlConfig, HttpConfig, TextConfig


def test_sql_config_valid() -> None:
  """Test standard SQL config structure."""
  data = {"query": "SELECT 1", "w": 12}
  model = SqlConfig(**data)
  assert model.query == "SELECT 1"
  assert model.w == 12
  assert model.h == 4  # Default


def test_sql_config_missing_query() -> None:
  """Test failure when query is missing."""
  with pytest.raises(ValidationError) as exc:
    SqlConfig(w=10)  # Type: ignore
  assert "query" in str(exc.value)


def test_http_config_url_validation() -> None:
  """Test URL parsing and validation."""
  # Valid
  model = HttpConfig(url="https://api.com/data")
  # Allow either variant (with or without slash) to be robust across pydantic versions
  assert str(model.url) in ["https://api.com/data/", "https://api.com/data"]

  # Invalid
  with pytest.raises(ValidationError):
    HttpConfig(url="not-a-url")


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
  adapter = TypeAdapter(WidgetCreate)
  model = adapter.validate_python(payload)

  assert model.type == "SQL"
  assert hasattr(model.config, "query")
  assert getattr(model.config, "query") == "SELECT * FROM t"


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
  adapter = TypeAdapter(WidgetCreate)
  model = adapter.validate_python(payload)

  assert model.type == "HTTP"
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
  adapter = TypeAdapter(WidgetCreate)
  model = adapter.validate_python(payload)

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

  adapter = TypeAdapter(WidgetCreate)

  with pytest.raises(ValidationError) as exc:
    adapter.validate_python(payload)

  errors = str(exc.value)
  assert "query" in errors
  assert "Field required" in errors


def test_polymorphic_invalid_http_method() -> None:
  """Test validation of nested enum fields."""
  payload = {
    "title": "Bad Method",
    "type": "HTTP",
    "visualization": "table",
    "config": {"url": "https://a.com", "method": "JUMP"},
  }
  adapter = TypeAdapter(WidgetCreate)

  with pytest.raises(ValidationError) as exc:
    adapter.validate_python(payload)

  assert "Input should be 'GET', 'POST'" in str(exc.value)
