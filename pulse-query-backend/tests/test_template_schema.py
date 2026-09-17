"""
Unit tests for Template API schemas and Handlebars validation.
"""

from uuid import uuid4
import pytest
from pydantic import ValidationError

from app.schemas.template import (
  TemplateBase,
  TemplateCreate,
  TemplateResponse,
  TemplateUpdate,
)


def test_template_base_valid_matching_handlebars() -> None:
  """Verifies that a template with exact matching handlebars tokens validates successfully."""
  template = TemplateBase(
    title="Valid Template",
    description="A test template",
    category="Availability",
    sql_template="SELECT * FROM data WHERE unit = '{{unit_name}}' AND cap > {{min_cap}};",
    parameters_schema={
      "type": "object",
      "properties": {
        "unit_name": {"type": "string"},
        "min_cap": {"type": "integer"},
      },
    },
  )
  assert template.title == "Valid Template"
  assert "unit_name" in template.parameters_schema["properties"]


def test_template_base_missing_placeholder_raises_error() -> None:
  """Verifies that defining schema properties not present in SQL raises a ValidationError."""
  with pytest.raises(ValidationError) as exc_info:
    TemplateBase(
      title="Invalid Template",
      category="Availability",
      sql_template="SELECT * FROM data WHERE unit = '{{unit_name}}';",
      parameters_schema={
        "type": "object",
        "properties": {
          "unit_name": {"type": "string"},
          "missing_param": {"type": "integer"},
        },
      },
    )
  assert "missing_param" in str(exc_info.value)


def test_template_base_non_dict_schema_or_empty_properties() -> None:
  """Verifies that empty properties or non-dict parameters_schema bypasses validation."""
  # Non-dict parameters_schema
  t1 = TemplateBase.model_construct(
    title="Raw Template",
    category="Test",
    sql_template="SELECT 1;",
    parameters_schema="not-a-dict",  # type: ignore[arg-type]
  )
  assert t1.validate_handlebars_match_schema() == t1

  # Non-dict properties
  t2 = TemplateBase(
    title="No Props Template",
    category="Test",
    sql_template="SELECT 1;",
    parameters_schema={"type": "object", "properties": None},  # type: ignore[arg-type]
  )
  assert t2.parameters_schema["properties"] is None

  # Empty properties
  t3 = TemplateBase(
    title="Empty Props Template",
    category="Test",
    sql_template="SELECT 1;",
    parameters_schema={"type": "object", "properties": {}},
  )
  assert t3.parameters_schema["properties"] == {}


def test_template_base_extra_placeholders_allowed() -> None:
  """Verifies that SQL templates may contain additional system placeholders not in schema."""
  template = TemplateBase(
    title="System Macro Template",
    category="Flow",
    sql_template="SELECT * FROM data WHERE unit = '{{unit_name}}' AND ts > {{now}};",
    parameters_schema={
      "type": "object",
      "properties": {
        "unit_name": {"type": "string"},
      },
    },
  )
  assert template.title == "System Macro Template"


def test_template_create_update_and_response() -> None:
  """Verifies TemplateCreate, TemplateUpdate, and TemplateResponse instantiation."""
  create = TemplateCreate(
    title="Create Title",
    category="General",
    sql_template="SELECT * FROM table WHERE id = {{id}};",
    parameters_schema={"type": "object", "properties": {"id": {"type": "integer"}}},
  )
  assert create.title == "Create Title"

  update = TemplateUpdate(title="New Title", description="Updated")
  assert update.title == "New Title"
  assert update.description == "Updated"

  tid = uuid4()
  resp = TemplateResponse(
    id=tid,
    title="Resp Title",
    category="General",
    sql_template="SELECT {{x}};",
    parameters_schema={"type": "object", "properties": {"x": {"type": "integer"}}},
  )
  assert resp.id == tid
