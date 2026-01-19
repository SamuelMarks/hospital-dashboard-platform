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

from typing import Literal, Dict, Any, Optional, Union, Annotated
from pydantic import BaseModel, Field, HttpUrl


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
  Configuration schema for SQL-type widgets.
  Enforces the presence of a SQL query string.

  Attributes:
      query (str): The raw SQL query to execute.
      xKey (Optional[str]): Column name to mapping for X-Axis/Labels.
      yKey (Optional[str]): Column name to mapping for Y-Axis/Values.
  """

  query: str = Field(..., min_length=1, description="The raw SQL query to execute.")
  xKey: Optional[str] = Field(None, description="Column for X-Axis/Labels")
  yKey: Optional[str] = Field(None, description="Column for Y-Axis/Values")


class HttpConfig(WidgetLayout):
  """
  Configuration schema for HTTP-type widgets.
  Enforces the presence of a valid URL and standard HTTP properties.

  Attributes:
      url (HttpUrl): The fully qualified target URL.
      method (str): HTTP Verb (GET, POST, etc.).
      headers (Dict[str, str]): Custom request headers.
      params (Dict[str, str]): URL Query parameters.
      body (Optional[Any]): JSON Body for mutation requests.
      meta_forward_auth (bool): If True, the backend forwards the user's JWT.
      xKey (Optional[str]): key path for X-Axis/Labels.
      yKey (Optional[str]): key path for Y-Axis/Values.
  """

  url: HttpUrl = Field(..., description="The fully qualified target URL.")
  method: Literal["GET", "POST", "PUT", "DELETE", "PATCH"] = Field("GET", description="HTTP Method")
  headers: Dict[str, str] = Field(default_factory=dict, description="Request Headers")
  params: Dict[str, str] = Field(default_factory=dict, description="Query Parameters")
  body: Optional[Any] = Field(None, description="JSON Body payload")
  meta_forward_auth: bool = Field(default=False, description="If true, forwards the user's JWT to the target.")
  xKey: Optional[str] = Field(None, description="JSON path for X-Axis/Labels")
  yKey: Optional[str] = Field(None, description="JSON path for Y-Axis/Values")


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
WidgetCreate = Annotated[Union[WidgetCreateSql, WidgetCreateHttp, WidgetCreateText], Field(discriminator="type")]


class WidgetUpdate(BaseModel):
  """
  Payload for updating a widget.
  Note: Polymorphism is relaxed on Updates because 'type' is often immutable or missing
  in partial PATCH requests. We allow a loose dict for config, but individual fields
  are validated if matched.

  Attributes:
      title (Optional[str]): New title.
      visualization (Optional[str]): New visualization type.
      config (Optional[Dict]): Partial configuration updates.
  """

  title: Optional[str] = None
  visualization: Optional[str] = None
  # We allow loose configuration on update to support partial patches
  # without requiring the 'type' field to be resent.
  config: Optional[Dict[str, Any]] = None
