"""
Strongly Typed JSON and SQL Value Type Definitions.

Defines recursive, strongly typed JSON primitives, JSON containers, and SQL
row structures without relying on `Any` or `object`.
"""

from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

type JsonPrimitive = str | int | float | bool | None
"""Primitive JSON scalar value (`str`, `int`, `float`, `bool`, or `None`)."""

type JsonValue = JsonPrimitive | list[JsonValue] | dict[str, JsonValue]
"""Recursive strongly-typed JSON value (`JsonPrimitive`, `list[JsonValue]`, or `dict[str, JsonValue]`)."""

type JsonObject = dict[str, JsonValue]
"""Strongly typed JSON object mapping string keys to `JsonValue` elements."""

type SqlScalar = str | int | float | bool | datetime | date | time | Decimal | UUID | None
"""Scalar cell value returned from DuckDB or PostgreSQL analytical queries."""

type SqlRow = dict[str, SqlScalar | JsonValue]
"""Single tabular result row mapping column names to `SqlScalar` or `JsonValue` values."""

__all__ = [
  "JsonObject",
  "JsonPrimitive",
  "JsonValue",
  "SqlRow",
  "SqlScalar",
]
