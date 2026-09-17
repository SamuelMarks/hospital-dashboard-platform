"""
Template API Schemas.

This module defines the Data Transfer Objects (DTOs) for the Template Registry API.
It includes rigorous validation for the `parameters_schema` field, ensuring
that stored templates conform to valid JSON Schema Draft 7 specifications for easy
frontend rendering.
"""

import re
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TemplateBase(BaseModel):
  """
  Shared properties for Widget Templates.

  Attributes:
      title (str): Display name.
      description (str | None): Helper text for the user.
      sql_template (str): The raw DuckDB SQL logic with Handlebars {{variables}}.
      category (str): The thematic grouping tag.
      parameters_schema (dict[str, Any]): A valid JSON Schema object defining
          the expected inputs. This schema drives the frontend dynamic form.
          Example:
          {
              "type": "object",
              "properties": {
                  "unit_name": { "type": "string", "enum": ["ICU", "ER"] },
                  "target_date": { "type": "string", "format": "date" }
              },
              "required": ["unit_name"]
          }
  """

  title: str = Field(..., min_length=3, max_length=100)
  description: str | None = None
  sql_template: str = Field(..., description="SQL with {{handlebars}} placeholders")
  category: str = Field(..., min_length=2)

  parameters_schema: dict[str, Any] = Field(
    default_factory=lambda: {"type": "object", "properties": {}},
    description="JSON Schema definition for dynamic form generation.",
  )

  @model_validator(mode="after")
  def validate_handlebars_match_schema(self) -> "TemplateBase":
    """
    Validates that every variable in the JSON schema 'properties' exists
    as a placeholder in the `sql_template`.

    Returns:
        TemplateBase: The validated template instance.

    Raises:
        ValueError: If a parameter defined in `parameters_schema['properties']`
            is not present as a `{{placeholder}}` in `sql_template`.
    """
    if not isinstance(self.parameters_schema, dict):
      return self

    properties = self.parameters_schema.get("properties")
    if not isinstance(properties, dict) or not properties:
      return self

    placeholders = set(re.findall(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", self.sql_template))
    defined_props = set(properties.keys())

    missing_in_sql = defined_props - placeholders
    if missing_in_sql:
      missing_str = ", ".join(sorted(missing_in_sql))
      raise ValueError(f"Parameters schema defines properties not found as {{{{placeholder}}}} in SQL: {missing_str}")
    return self


class TemplateCreate(TemplateBase):
  """
  Payload for creating a new template.
  Inherits validation from TemplateBase.
  """


class TemplateUpdate(BaseModel):
  """
  Payload for updating an existing template.
  Partial fields allowed.
  """

  title: str | None = None
  description: str | None = None
  sql_template: str | None = None
  category: str | None = None
  parameters_schema: dict[str, Any] | None = None


class TemplateResponse(TemplateBase):
  """
  API Response model for a Template.
  Include database ID.
  """

  id: UUID

  model_config = ConfigDict(from_attributes=True)
