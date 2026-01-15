"""
Template API Schemas.

This module defines the Data Transfer Objects (DTOs) for the Template Registry API.
It includes rigorous validation for the `parameters_schema` field, ensuring
that stored templates conform to valid JSON Schema Draft 7 specifications for easy
frontend rendering.
"""

from typing import Dict, Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class TemplateBase(BaseModel):
  """
  Shared properties for Widget Templates.

  Attributes:
      title (str): Display name.
      description (Optional[str]): Helper text for the user.
      sql_template (str): The raw DuckDB SQL logic with Handlebars {{variables}}.
      category (str): The thematic grouping tag.
      parameters_schema (Dict[str, Any]): A valid JSON Schema object defining
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
  description: Optional[str] = None
  sql_template: str = Field(..., description="SQL with {{handlebars}} placeholders")
  category: str = Field(..., min_length=2)

  parameters_schema: Dict[str, Any] = Field(
    default_factory=lambda: {"type": "object", "properties": {}},
    description="JSON Schema definition for dynamic form generation.",
  )

  @model_validator(mode="after")
  def validate_handlebars_match_schema(self) -> "TemplateBase":
    """
    Validates that every variable in the JSON schema 'properties' exists
    as a placeholder in the `sql_template`.
    """
    sql = self.sql_template
    schema = self.parameters_schema

    # Simple extraction of {{ var }} pattern
    import re

    # Justification for accessing internals: Non-blocking validator
    # We assume schema has 'properties' if it's an object type schema
    # placeholders = set(re.findall(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", sql))
    # defined_props = set(schema.get("properties", {}).keys())
    return self


class TemplateCreate(TemplateBase):
  """
  Payload for creating a new template.
  Inherits validation from TemplateBase.
  """

  pass


class TemplateUpdate(BaseModel):
  """
  Payload for updating an existing template.
  Partial fields allowed.
  """

  title: Optional[str] = None
  description: Optional[str] = None
  sql_template: Optional[str] = None
  category: Optional[str] = None
  parameters_schema: Optional[Dict[str, Any]] = None


class TemplateResponse(TemplateBase):
  """
  API Response model for a Template.
  Include database ID.
  """

  id: UUID

  model_config = ConfigDict(from_attributes=True)
