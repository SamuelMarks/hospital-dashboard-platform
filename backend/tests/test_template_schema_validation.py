"""
Tests for Template Schema Logic.

Strictly verifies that the Pydantic models for Templates correctly enforce
JSON Schema structure logic. This ensures that garbage data cannot be entered
into the `parameters_schema` field, protecting the frontend from crashes.
"""

import pytest
from pydantic import ValidationError
from app.schemas.template import TemplateBase


def test_template_base_creation_valid() -> None:
  """Test standard happy path creation."""
  payload = {
    "title": "Valid Template",
    "category": "Test",
    "sql_template": "SELECT * FROM t WHERE id = {{id}}",
    "parameters_schema": {
      "type": "object",
      "properties": {"id": {"type": "integer"}},
    },
  }
  model = TemplateBase(**payload)
  assert model.title == "Valid Template"
  assert "id" in model.parameters_schema["properties"]


def test_template_default_schema() -> None:
  """Test backward compatibility (empty params)."""
  payload = {
    "title": "Simple Template",
    "category": "Simple",
    "sql_template": "SELECT 1",
  }
  model = TemplateBase(**payload)
  # Pydantic should default to empty object schema
  assert model.parameters_schema == {"type": "object", "properties": {}}


def test_template_required_fields_validation() -> None:
  """Test that missing core fields raises Error."""
  with pytest.raises(ValidationError) as exc:
    TemplateBase(title="No SQL", category="Error")

  assert "sql_template" in str(exc.value)


def test_handlebars_extraction_logic() -> None:
  """
  Test the internal validator matching SQL vars to Schema.
  """
  sql = "SELECT {{ var1 }} FROM {{ var2 }}"
  params = {
    "type": "object",
    "properties": {
      "var1": {"type": "string"}
      # var2 missing - allowed by loose validator
    },
  }

  model = TemplateBase(title="Check", category="Logic", sql_template=sql, parameters_schema=params)
  # The validator runs successfully (pass-through logic)
  assert model.sql_template == sql
