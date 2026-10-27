"""
Widget Validation Schemas.

This module defines the strict Pydantic models for Widget Configurations.
It uses **Discriminated Unions** to enforce polymorphic validation checks at
the API Gateway level.

Classes:
    WidgetLayout: Base grid positioning.
    SqlConfig: Specific validation for SQL-based widgets (requires query).
    HttpConfig: Specific validation for HTTP-based widgets (requires URL).
    TextConfig: Specific validation for Static Text widgets (requires content).
    WidgetCreate: A Discriminated Union that selects the correct config schema
                  based on the `type` field.
    WidgetUpdate: Loose schema for partial updates.
"""

from collections.abc import Mapping
from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl, ValidationError, model_validator

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import JsonObject, JsonValue


def is_valid_processor_identifier(processor: str) -> bool:
  """
  Checks whether a processor string is `'SQL'` or a valid `provider:model` / `provider/model` identifier.

  Args:
      processor (str): Processor identifier string to validate.

  Returns:
      bool: True if `'SQL'` or non-empty `provider:model` / `provider/model`, else False.
  """
  cleaned = processor.strip()
  if cleaned == "SQL":
    return True
  sep = ":" if ":" in cleaned else ("/" if "/" in cleaned else "")
  if not sep:
    return False
  provider, model_name = [part.strip() for part in cleaned.split(sep, 1)]
  return bool(provider and model_name)


class WidgetLayout(BaseModel):
  """
  Common layout properties shared by all widget configurations.
  Used by the frontend grid system.

  Attributes:
      x (int): Horizontal grid position (0-12).
      y (int): Vertical grid position.
      w (int): Width in grid columns.
      h (int): Height in grid rows.
  """

  x: int = Field(0, ge=0, description="Grid X position")
  y: int = Field(0, ge=0, description="Grid Y position")
  w: int = Field(6, ge=1, le=12, description="Grid Width (cols)")
  h: int = Field(4, ge=1, description="Grid Height (rows)")


class SqlConfig(WidgetLayout):
  """
  Configuration schema for SQL-type widgets (including natural-text-enabled SQL widgets).

  Attributes:
      query (str | None): The raw SQL query to execute (optional when `allow_natural_text=True`).
      xKey (str | None): Column name mapping for X-Axis/Labels.
      yKey (str | None): Column name mapping for Y-Axis/Values.
      allow_natural_text (bool): Whether the widget renders a natural text input on the dashboard.
      processor (str): Processor identifier (`'SQL'` [no model], `'ollama:<model>'`, or `'<provider>:<model>'`).
      natural_text_prompt (str | None): Default or saved natural text prompt for this widget.
      placeholder_text (str | None): Optional placeholder shown in the widget's natural text input.
  """

  query: str | None = Field(default=None, description="The raw SQL query to execute.")
  xKey: str | None = Field(None, description="Column for X-Axis/Labels")
  yKey: str | None = Field(None, description="Column for Y-Axis/Values")
  allow_natural_text: bool = Field(
    default=False,
    description="Whether the widget allows the user to enter natural text on the dashboard.",
  )
  processor: str = Field(
    default="SQL",
    description="Processor identifier: 'SQL' [no model], 'ollama:<model>', or '<any-llm-provider>:<model>'.",
  )
  natural_text_prompt: str | None = Field(
    default=None,
    description="Default or saved natural text prompt for this widget.",
  )
  placeholder_text: str | None = Field(
    default=None,
    description="Optional placeholder shown in the widget's natural text input.",
  )

  @model_validator(mode="after")
  def validate_sql_and_processor(self) -> "SqlConfig":
    """
    Validates that `processor` is well-formed and `query` is present unless `allow_natural_text=True`.

    Returns:
        SqlConfig: Validated SQL widget configuration instance.

    Raises:
        ValueError: When `processor` is malformed or `query` is missing/empty while `allow_natural_text=False`.
    """
    if not is_valid_processor_identifier(self.processor):
      raise ValueError("Invalid processor identifier. Expected 'SQL' or '<provider>:<model>'.")

    has_query = bool(self.query and self.query.strip())
    if not self.allow_natural_text:
      if not has_query:
        raise ValueError("Field required: 'query' must be a non-empty SQL string when allow_natural_text is False.")
      return self

    if not has_query:
      if self.processor == "SQL" and self.natural_text_prompt and self.natural_text_prompt.strip():
        self.query = self.natural_text_prompt.strip()
      else:
        self.query = ""
    return self


SQLWidgetConfig = SqlConfig


class HttpConfig(WidgetLayout):
  """
  Configuration schema for HTTP-type widgets.
  Enforces the presence of a valid URL and standard HTTP properties.

  Attributes:
      url (HttpUrl): The fully qualified target URL.
      method (str): HTTP Verb (GET, POST, etc.).
      headers (dict[str, str]): Custom request headers.
      params (dict[str, str]): URL Query parameters.
      body (JsonValue): JSON Body for mutation requests.
      meta_forward_auth (bool): If True, the backend forwards the user's JWT.
      xKey (str | None): key path for X-Axis/Labels.
      yKey (str | None): key path for Y-Axis/Values.
  """

  url: HttpUrl = Field(..., description="The fully qualified target URL.")
  method: Literal["GET", "POST", "PUT", "DELETE", "PATCH"] = Field("GET", description="HTTP Method")
  headers: dict[str, str] = Field(default_factory=dict, description="Request Headers")
  params: dict[str, str] = Field(default_factory=dict, description="Query Parameters")
  body: JsonValue = Field(None, description="JSON Body payload")
  meta_forward_auth: bool = Field(default=False, description="If true, forwards the user's JWT to the target.")
  xKey: str | None = Field(None, description="JSON path for X-Axis/Labels")
  yKey: str | None = Field(None, description="JSON path for Y-Axis/Values")


class TextConfig(WidgetLayout):
  """
  Configuration schema for Static Text/Markdown widgets.

  Attributes:
      content (str): The static text content (Markdown supported).
  """

  content: str = Field(..., description="Markdown text content.")


# --- Polymorphic Creation Models ---


class WidgetCreateSql(BaseModel):
  """
  Payload for creating a SQL Widget.
  Strictly enforces `type="SQL"` and `config` matching SqlConfig.
  """

  title: str = Field(..., min_length=1, max_length=100)
  type: Literal["SQL"]
  visualization: str = Field(..., description="Visualization ID (e.g. 'table', 'bar_chart')")
  config: SqlConfig = Field(..., description="SQL-specific configuration")


class WidgetCreateHttp(BaseModel):
  """
  Payload for creating an HTTP Widget.
  Strictly enforces `type="HTTP"` and `config` matching HttpConfig.
  """

  title: str = Field(..., min_length=1, max_length=100)
  type: Literal["HTTP"]
  visualization: str = Field(..., description="Visualization ID (e.g. 'table', 'metric')")
  config: HttpConfig = Field(..., description="HTTP-specific configuration")


class WidgetCreateText(BaseModel):
  """
  Payload for creating a Text Widget.
  Strictly enforces `type="TEXT"` and `config` matching TextConfig.
  """

  title: str = Field(..., min_length=1, max_length=100)
  type: Literal["TEXT"]
  visualization: Literal["markdown"] = Field("markdown", description="Fixed visualization ID for text.")
  config: TextConfig = Field(..., description="Text-specific configuration")


# Discriminated Union: This is the primary type used in API routes.
# Pydantic will check the 'type' field.
WidgetCreate = Annotated[WidgetCreateSql | WidgetCreateHttp | WidgetCreateText, Field(discriminator="type")]


WidgetConfigUnion = SqlConfig | HttpConfig | TextConfig


def parse_widget_config_result(
  widget_type: str,
  raw_config: Mapping[str, JsonValue],
) -> AppResult[WidgetConfigUnion]:
  """
  Parses an untyped widget configuration dictionary into its discriminated domain model.

  Args:
      widget_type (str): Widget type discriminator (`'SQL'`, `'HTTP'`, or `'TEXT'`).
      raw_config (Mapping[str, JsonValue]): Raw JSON configuration dictionary.

  Returns:
      AppResult[WidgetConfigUnion]: `Ok(SqlConfig | HttpConfig | TextConfig)` or `Err(AppError)`.
  """
  normalized_type = widget_type.upper()
  try:
    if normalized_type == "SQL":
      return Ok(SqlConfig.model_validate(dict(raw_config)))
    if normalized_type == "HTTP":
      return Ok(HttpConfig.model_validate(dict(raw_config)))
    if normalized_type == "TEXT":
      return Ok(TextConfig.model_validate(dict(raw_config)))
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Unknown widget type: {widget_type}",
        status_code=400,
      )
    )
  except ValidationError as exc:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=str(exc),
        status_code=400,
      )
    )


def parse_sql_config_lenient(raw_config: Mapping[str, JsonValue]) -> SqlConfig:
  """
  Parses a stored or partial SQL widget configuration dictionary into a typed `SqlConfig` instance
  without raising on empty queries for legacy or partial update records.

  Args:
      raw_config (Mapping[str, JsonValue]): Raw configuration mapping.

  Returns:
      SqlConfig: Typed `SqlConfig` instance with normalized attributes.
  """
  raw_query = raw_config.get("query")
  query_val = str(raw_query) if isinstance(raw_query, str) else ""
  raw_proc = raw_config.get("processor")
  proc_val = str(raw_proc).strip() if isinstance(raw_proc, str) and str(raw_proc).strip() else "SQL"
  raw_prompt = raw_config.get("natural_text_prompt")
  prompt_val = str(raw_prompt) if isinstance(raw_prompt, str) else None
  raw_placeholder = raw_config.get("placeholder_text")
  placeholder_val = str(raw_placeholder) if isinstance(raw_placeholder, str) else None
  raw_x = raw_config.get("xKey")
  raw_y = raw_config.get("yKey")
  return SqlConfig.model_construct(
    query=query_val,
    xKey=str(raw_x) if isinstance(raw_x, str) else None,
    yKey=str(raw_y) if isinstance(raw_y, str) else None,
    allow_natural_text=bool(raw_config.get("allow_natural_text", False)),
    processor=proc_val,
    natural_text_prompt=prompt_val,
    placeholder_text=placeholder_val,
  )


class WidgetUpdate(BaseModel):
  """
  Payload for updating a widget.
  Note: Polymorphism is relaxed on Updates because 'type' is often immutable or missing
  in partial PATCH requests. We allow a typed JSON object for config, and individual fields
  are validated if matched.

  Attributes:
      title (str | None): New title.
      visualization (str | None): New visualization type.
      config (JsonObject | None): Partial configuration updates.
  """

  title: str | None = None
  visualization: str | None = None
  # We allow loose configuration on update to support partial patches
  # without requiring the 'type' field to be resent.
  config: JsonObject | None = None
