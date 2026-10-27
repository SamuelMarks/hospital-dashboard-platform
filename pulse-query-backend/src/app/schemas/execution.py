"""
Widget and Query Execution Schemas.

Defines strongly typed TypedDicts and Pydantic schemas for SQL and HTTP
widget runner outputs and dashboard execution responses.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, Literal, NotRequired, TypedDict

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.schemas.json_types import JsonObject, JsonValue, SqlRow

WidgetTypeLiteral = Literal["SQL", "HTTP", "TEXT"]
"""Canonical literal union for supported dashboard widget types."""


class ResolvedSqlQuery(BaseModel):
  """
  Strongly typed domain model representing a resolved SQL widget execution configuration.

  Attributes:
      run_config (JsonObject): Interpolated widget execution configuration dictionary.
      effective_processor (str): Processor identifier used (`'SQL'` or `<provider>:<model>`).
      effective_natural_text (str | None): Resolved natural language prompt or SQL text.
  """

  run_config: JsonObject
  effective_processor: str = "SQL"
  effective_natural_text: str | None = None


class SqlExecutionPayload(BaseModel):
  """
  Strongly typed Pydantic model for a SQL widget execution payload.

  Attributes:
      kind (Literal["sql"]): Discriminator tag identifying a SQL widget execution payload.
      data (list[SqlRow | JsonValue]): List of row dictionaries returned by DuckDB.
      columns (list[str]): Ordered list of column names.
      error (str | None): Error message if SQL execution failed, else None.
      generated_sql (str | None): Optional generated or executed SQL string.
      processor_used (str | None): Optional processor identifier used.
      natural_text (str | None): Optional natural language input processed.
  """

  model_config = ConfigDict(extra="allow")

  kind: Literal["sql"] = "sql"
  data: list[SqlRow | JsonValue] = Field(default_factory=list)
  columns: list[str] = Field(default_factory=list)
  error: str | None = None
  generated_sql: str | None = None
  processor_used: str | None = None
  natural_text: str | None = None


class HttpExecutionPayload(BaseModel):
  """
  Strongly typed Pydantic model for an HTTP widget execution payload.

  Attributes:
      kind (Literal["http"]): Discriminator tag identifying an HTTP widget execution payload.
      data (JsonValue): Parsed JSON or raw text payload returned by the target HTTP endpoint.
      status (int | str): HTTP status code (or status label).
      error (str | None): Error message if the HTTP request failed, else None.
  """

  model_config = ConfigDict(extra="allow")

  kind: Literal["http"] = "http"
  data: JsonValue = None
  status: int | str = 200
  error: str | None = None


class TextExecutionPayload(BaseModel):
  """
  Strongly typed Pydantic model for a static TEXT/Markdown widget execution payload.

  Attributes:
      kind (Literal["text"]): Discriminator tag identifying a static text widget payload.
      status (Literal["success"]): Fixed success status string.
      data (None): Always None for static text widgets.
      error (str | None): Always None for static text widgets.
  """

  model_config = ConfigDict(extra="allow")

  kind: Literal["text"] = "text"
  status: Literal["success"] = "success"
  data: None = None
  error: str | None = None


class ErrorExecutionPayload(BaseModel):
  """
  Strongly typed Pydantic model for a widget execution error payload.

  Attributes:
      kind (Literal["error"]): Discriminator tag identifying an execution error payload.
      error (str): Human-readable execution error message.
      data (list[SqlRow | JsonValue] | JsonValue): Optional empty data array for client compatibility.
      columns (list[str] | None): Optional empty columns array for client compatibility.
      generated_sql (str | None): Optional generated SQL snippet if available.
      processor_used (str | None): Optional processor identifier used.
      natural_text (str | None): Optional natural language input processed.
  """

  model_config = ConfigDict(extra="allow")

  kind: Literal["error"] = "error"
  error: str
  data: list[SqlRow | JsonValue] | JsonValue = None
  columns: list[str] | None = None
  generated_sql: str | None = None
  processor_used: str | None = None
  natural_text: str | None = None


def coerce_execution_payload(val: Mapping[str, JsonValue]) -> JsonObject:
  """
  Infers the discriminator `'kind'` field when validating raw runner dictionaries into `WidgetExecutionPayload`.

  Args:
      val (Mapping[str, JsonValue]): Raw runner dictionary.

  Returns:
      JsonObject: Normalized dictionary with `'kind'` populated.
  """
  d: JsonObject = dict(val)
  err_val = d.get("error")
  if isinstance(err_val, str) and err_val:
    d["kind"] = "error"
  elif d.get("status") == "success" and d.get("data") is None:
    d["kind"] = "text"
  elif "status" in d and "columns" not in d:
    d["kind"] = "http"
  else:
    d["kind"] = "sql"
  return d


WidgetExecutionPayload = Annotated[
  Annotated[
    SqlExecutionPayload | HttpExecutionPayload | TextExecutionPayload | ErrorExecutionPayload,
    Field(discriminator="kind"),
  ],
  BeforeValidator(coerce_execution_payload),
]
"""Discriminated union of all strongly typed widget execution payload models."""

SqlWidgetExecutionResult = SqlExecutionPayload
HttpWidgetExecutionResult = HttpExecutionPayload
TextWidgetExecutionResult = TextExecutionPayload
WidgetExecutionErrorResult = ErrorExecutionPayload

type WidgetExecutionResultUnion = (
  SqlExecutionPayload | HttpExecutionPayload | TextExecutionPayload | ErrorExecutionPayload
)
"""Union of all strongly typed widget execution result models."""


class WidgetRefreshRequest(BaseModel):
  """
  Strongly typed request payload for refreshing a single widget (`POST /dashboards/{id}/widgets/{wid}/refresh`).

  Attributes:
      global_params (JsonObject | None): Optional nested global filter parameters dictionary.
      natural_text (str | None): Optional user-entered natural language prompt or raw SQL query.
      processor (str | None): Optional processor override (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`).
      dept (str | None): Optional clinical department filter shorthand.
      department (str | None): Optional department filter shorthand.
      service (str | None): Optional clinical service filter shorthand.
      start_date (str | None): Optional start date filter shorthand (`YYYY-MM-DD`).
      end_date (str | None): Optional end date filter shorthand (`YYYY-MM-DD`).
      unit (str | None): Optional hospital unit filter shorthand.
  """

  model_config = ConfigDict(extra="allow")

  global_params: JsonObject | None = Field(
    default=None,
    description="Optional global dashboard filter parameters dictionary.",
  )
  natural_text: str | None = Field(
    default=None,
    description="Optional user-entered natural language prompt or raw SQL query.",
  )
  processor: str | None = Field(
    default=None,
    description="Optional processor override ('SQL', 'ollama:<model>', or '<provider>:<model>').",
  )
  dept: str | None = Field(default=None, description="Optional clinical department filter.")
  department: str | None = Field(default=None, description="Optional department filter.")
  service: str | None = Field(default=None, description="Optional clinical service filter.")
  start_date: str | None = Field(default=None, description="Optional start date filter (YYYY-MM-DD).")
  end_date: str | None = Field(default=None, description="Optional end date filter (YYYY-MM-DD).")
  unit: str | None = Field(default=None, description="Optional hospital unit filter.")

  def to_filter_params(self) -> JsonObject | None:
    """
    Extracts the resolved global filter parameters dictionary from explicit fields and extra keys.

    Returns:
        JsonObject | None: Merged filter parameter dictionary, or None if no filters were provided.
    """
    merged: JsonObject = {}
    if isinstance(self.global_params, dict):
      merged.update(self.global_params)
    shorthand_fields: dict[str, str | None] = {
      "dept": self.dept,
      "department": self.department,
      "service": self.service,
      "start_date": self.start_date,
      "end_date": self.end_date,
      "unit": self.unit,
    }
    for key, val in shorthand_fields.items():
      if val is not None:
        merged[key] = val
    if self.model_extra:
      merged.update(self.model_extra)
    return merged if merged else None


class SqlRunnerResultDict(TypedDict):
  """
  Typed dictionary representing the output of `run_sql_widget`.

  Attributes:
      data (list[SqlRow]): List of row dictionaries returned by DuckDB.
      columns (list[str]): Ordered list of column names.
      error (str | None): Error message if SQL execution failed, else None.
      generated_sql (NotRequired[str | None]): Optional generated or executed SQL string.
      processor_used (NotRequired[str | None]): Optional processor identifier used.
      natural_text (NotRequired[str | None]): Optional natural language input processed.
  """

  data: list[SqlRow]
  columns: list[str]
  error: str | None
  generated_sql: NotRequired[str | None]
  processor_used: NotRequired[str | None]
  natural_text: NotRequired[str | None]


class HttpRunnerResultDict(TypedDict):
  """
  Typed dictionary representing the output of `run_http_widget`.

  Attributes:
      data (JsonValue): Parsed JSON or raw text dictionary returned by the target HTTP endpoint.
      status (int): HTTP status code (or 0 on network connection failure).
      error (str | None): Error message if the HTTP request failed, else None.
  """

  data: JsonValue
  status: int
  error: str | None


class SqlRunnerPayload(BaseModel):
  """
  Strongly typed Pydantic model for successful SQL runner execution.

  Attributes:
      data (list[SqlRow]): Row dictionaries returned by DuckDB.
      columns (list[str]): Column names in result order.
      generated_sql (str | None): SQL query generated by the processor or executed directly.
      processor_used (str | None): Processor identifier used (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`).
      natural_text (str | None): User natural text input processed during execution.
  """

  data: list[SqlRow] = Field(default_factory=list, description="Row records returned by the SQL query.")
  columns: list[str] = Field(default_factory=list, description="Column headers from the query cursor.")
  generated_sql: str | None = Field(default=None, description="SQL query generated or executed.")
  processor_used: str | None = Field(default=None, description="Processor identifier used.")
  natural_text: str | None = Field(default=None, description="Natural text input processed.")


class WidgetExecutionRequest(BaseModel):
  """
  Request payload for refreshing/executing a single widget with optional natural text and processor override.

  Attributes:
      global_params (JsonObject): Global dashboard filter parameters.
      natural_text (str | None): User-entered natural language prompt or raw SQL query.
      processor (str | None): Optional processor override (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`).
  """

  global_params: JsonObject = Field(default_factory=dict, description="Global dashboard filter parameters.")
  natural_text: str | None = Field(
    default=None,
    description="User-entered natural language prompt or raw SQL query submitted from the widget.",
  )
  processor: str | None = Field(
    default=None,
    description="Optional processor override ('SQL', 'ollama:<model>', or '<provider>:<model>').",
  )


class HttpRunnerPayload(BaseModel):
  """
  Strongly typed Pydantic model for successful HTTP runner execution.

  Attributes:
      data (JsonValue): Parsed response body.
      status (int): HTTP response status code.
  """

  data: JsonValue = Field(default=None, description="Parsed response payload from the HTTP endpoint.")
  status: int = Field(default=200, description="HTTP status code returned by the endpoint.")
