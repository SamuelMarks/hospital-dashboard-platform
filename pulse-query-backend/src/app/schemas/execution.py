"""
Widget and Query Execution Schemas.

Defines strongly typed TypedDicts and Pydantic schemas for SQL and HTTP
widget runner outputs and dashboard execution responses.
"""

from __future__ import annotations

from typing import Any, TypedDict

from pydantic import BaseModel, Field


class SqlRunnerResultDict(TypedDict):
  """
  Typed dictionary representing the output of `run_sql_widget`.

  Attributes:
      data (list[dict[str, Any]]): List of row dictionaries returned by DuckDB.
      columns (list[str]): Ordered list of column names.
      error (str | None): Error message if SQL execution failed, else None.
  """

  data: list[dict[str, Any]]
  columns: list[str]
  error: str | None


class HttpRunnerResultDict(TypedDict):
  """
  Typed dictionary representing the output of `run_http_widget`.

  Attributes:
      data (Any): Parsed JSON or raw text dictionary returned by the target HTTP endpoint.
      status (int): HTTP status code (or 0 on network connection failure).
      error (str | None): Error message if the HTTP request failed, else None.
  """

  data: Any
  status: int
  error: str | None


class SqlRunnerPayload(BaseModel):
  """
  Strongly typed Pydantic model for successful SQL runner execution.

  Attributes:
      data (list[dict[str, Any]]): Row dictionaries returned by DuckDB.
      columns (list[str]): Column names in result order.
  """

  data: list[dict[str, Any]] = Field(default_factory=list, description="Row records returned by the SQL query.")
  columns: list[str] = Field(default_factory=list, description="Column headers from the query cursor.")


class HttpRunnerPayload(BaseModel):
  """
  Strongly typed Pydantic model for successful HTTP runner execution.

  Attributes:
      data (Any): Parsed response body.
      status (int): HTTP response status code.
  """

  data: Any = Field(default=None, description="Parsed response payload from the HTTP endpoint.")
  status: int = Field(default=200, description="HTTP status code returned by the endpoint.")
