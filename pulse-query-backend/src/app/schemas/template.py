"""
Template API Schemas.

This module defines the Data Transfer Objects (DTOs) for the Template Registry API.
It includes rigorous validation for the `parameters_schema` field, ensuring
that stored templates conform to valid JSON Schema Draft 7 specifications for easy
frontend rendering.
"""

import re
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.json_types import JsonObject, JsonPrimitive, JsonValue


class JsonSchemaProperty(BaseModel):
  """
  Typed JSON Schema Draft-7 property definition for dynamic template form parameters.

  Attributes:
      type (str): JSON Schema primitive type (`'string'`, `'number'`, `'integer'`, `'boolean'`).
      title (str | None): Human-readable field label.
      description (str | None): Field helper text.
      default (JsonPrimitive): Default parameter value.
      enum (list[JsonPrimitive] | None): Optional enumerated allowed values.
  """

  type: str = "string"
  title: str | None = None
  description: str | None = None
  default: JsonPrimitive = None
  enum: list[JsonPrimitive] | None = None

  model_config = ConfigDict(extra="allow")


class JsonSchemaDefinition(BaseModel):
  """
  Strongly typed JSON Schema Draft-7 object definition for template parameters.

  Attributes:
      type (str): Schema root type, defaulting to `'object'`.
      properties (dict[str, JsonSchemaProperty | JsonObject]): Map of parameter names to property schemas.
      required (list[str]): List of required parameter names.
  """

  type: str = "object"
  properties: dict[str, JsonSchemaProperty | JsonObject] = Field(default_factory=dict)
  required: list[str] = Field(default_factory=list)

  model_config = ConfigDict(extra="allow")


def _default_parameters_schema() -> JsonObject:
  """
  Returns the default empty JSON Schema Draft-7 object dictionary.

  Returns:
      JsonObject: Default JSON Schema dictionary `{"type": "object", "properties": {}}`.
  """
  return {"type": "object", "properties": {}}


class TemplateBase(BaseModel):
  """
  Shared properties for Widget Templates.

  Attributes:
      title (str): Display name.
      description (str | None): Helper text for the user.
      sql_template (str): The raw DuckDB SQL logic with Handlebars {{variables}}.
      category (str): The thematic grouping tag.
      parameters_schema (JsonObject): A valid JSON Schema object defining
          the expected inputs. This schema drives the frontend dynamic form.
  """

  title: str = Field(..., min_length=3, max_length=100)
  description: str | None = None
  sql_template: str = Field(..., description="SQL with {{handlebars}} placeholders")
  category: str = Field(..., min_length=2)

  parameters_schema: JsonObject = Field(
    default_factory=_default_parameters_schema,
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
  parameters_schema: JsonObject | None = None


class TemplateResponse(TemplateBase):
  """
  API Response model for a Template.
  Include database ID.
  """

  id: UUID

  model_config = ConfigDict(from_attributes=True)


class TemplateInstantiateRequest(BaseModel):
  """
  Request payload for instantiating a SQL template with user-supplied parameters.

  Attributes:
      parameters (dict[str, JsonValue]): Runtime parameter key-value overrides to inject.
  """

  parameters: dict[str, JsonValue] = Field(
    default_factory=dict,
    description="Runtime parameter values keyed by placeholder name.",
  )


class TemplateInstantiateResponse(BaseModel):
  """
  Response payload returned after interpolating a SQL template on the backend.

  Attributes:
      template_id (UUID): Identifier of the source template.
      title (str): Default title of the template.
      visualization (str): Recommended visualization type (`metric`, `bar_chart`, `pie`, `table`).
      query (str): Interpolated, SQL-injection-safe DuckDB query string.
  """

  template_id: UUID
  title: str
  visualization: str
  query: str
