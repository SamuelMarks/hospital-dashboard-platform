"""
Strongly typed Result monad and unified domain error hierarchy.

Provides `Ok[T]`, `Err[E]`, `Result[T, E]` (railway-oriented programming),
and the canonical `ErrorCode` enum + `AppError` domain error structure to
represent failures explicitly without relying on untyped exception control flow.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Generic, TypeVar

T = TypeVar("T")
U = TypeVar("U")
E = TypeVar("E")
F = TypeVar("F")


class ErrorCode(StrEnum):
  """Canonical error code enumeration for all backend domain operations."""

  DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"
  SQL_VALIDATION_ERROR = "SQL_VALIDATION_ERROR"
  SQL_EXECUTION_ERROR = "SQL_EXECUTION_ERROR"
  SSRF_BLOCKED = "SSRF_BLOCKED"
  HTTP_EXECUTION_ERROR = "HTTP_EXECUTION_ERROR"
  SIMULATION_INFEASIBLE = "SIMULATION_INFEASIBLE"
  SIMULATION_INVALID_DATA = "SIMULATION_INVALID_DATA"
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR"
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR"
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR"
  LLM_PROVIDER_ERROR = "LLM_PROVIDER_ERROR"
  VALIDATION_ERROR = "VALIDATION_ERROR"
  IO_ERROR = "IO_ERROR"
  INTERNAL_ERROR = "INTERNAL_ERROR"


@dataclass(frozen=True, slots=True)
class AppError:
  """
  Structured domain error value returned inside `Err[AppError]`.

  Attributes:
      code (ErrorCode): Canonical domain error classification.
      message (str): Human-readable description of the error.
      status_code (int): Corresponding HTTP status code for API translation.
      details (dict[str, str]): Optional structured diagnostic key-value pairs.
  """

  code: ErrorCode
  message: str
  status_code: int = 400
  details: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Ok(Generic[T]):
  """
  Represents a successful computation containing a typed value `T`.

  Attributes:
      value (T): The wrapped success payload.
  """

  value: T

  def is_ok(self) -> bool:
    """
    Returns True indicating this Result is an `Ok` variant.

    Returns:
        bool: Always True for `Ok`.
    """
    return True

  def is_err(self) -> bool:
    """
    Returns False indicating this Result is not an `Err` variant.

    Returns:
        bool: Always False for `Ok`.
    """
    return False

  def unwrap_or(self, default: T) -> T:
    """
    Returns the contained `Ok` value, ignoring the fallback `default`.

    Args:
        default (T): Fallback value (unused for `Ok`).

    Returns:
        T: The wrapped `value`.
    """
    return self.value

  def map(self, op: Callable[[T], U]) -> Ok[U]:
    """
    Maps a `Result[T, E]` to `Result[U, E]` by applying `op` to the contained `Ok` value.

    Args:
        op (Callable[[T], U]): Transformation function applied to `self.value`.

    Returns:
        Ok[U]: New `Ok` wrapping `op(self.value)`.
    """
    return Ok(op(self.value))

  def map_err(self, op: Callable[[Any], F]) -> Ok[T]:
    """
    Maps a `Result[T, E]` to `Result[T, F]`, leaving `Ok` untouched.

    Args:
        op (Callable[[Any], F]): Error transformation function (unused for `Ok`).

    Returns:
        Ok[T]: `Ok(self.value)`.
    """
    return Ok(self.value)

  def and_then(self, op: Callable[[T], Result[U, E]]) -> Result[U, E]:
    """
    Chains another `Result`-returning operation onto the contained `Ok` value.

    Args:
        op (Callable[[T], Result[U, E]]): Continuation function returning a `Result`.

    Returns:
        Result[U, E]: The result of calling `op(self.value)`.
    """
    return op(self.value)


@dataclass(frozen=True, slots=True)
class Err(Generic[E]):
  """
  Represents a failed computation containing a typed error `E`.

  Attributes:
      error (E): The wrapped error payload.
  """

  error: E

  def is_ok(self) -> bool:
    """
    Returns False indicating this Result is not an `Ok` variant.

    Returns:
        bool: Always False for `Err`.
    """
    return False

  def is_err(self) -> bool:
    """
    Returns True indicating this Result is an `Err` variant.

    Returns:
        bool: Always True for `Err`.
    """
    return True

  def unwrap_or(self, default: T) -> T:
    """
    Returns the provided fallback `default` value since this is an `Err`.

    Args:
        default (T): Fallback value to return.

    Returns:
        T: The `default` argument.
    """
    return default

  def map(self, op: Callable[[Any], U]) -> Err[E]:
    """
    Leaves the `Err` value untouched when mapping over the success type.

    Args:
        op (Callable[[Any], U]): Success transformation function (unused for `Err`).

    Returns:
        Err[E]: `Err(self.error)`.
    """
    return Err(self.error)

  def map_err(self, op: Callable[[E], F]) -> Err[F]:
    """
    Maps a `Result[T, E]` to `Result[T, F]` by applying `op` to the contained `Err` value.

    Args:
        op (Callable[[E], F]): Transformation function applied to `self.error`.

    Returns:
        Err[F]: New `Err` wrapping `op(self.error)`.
    """
    return Err(op(self.error))

  def and_then(self, op: Callable[[Any], Result[U, E]]) -> Err[E]:
    """
    Short-circuits a chained operation, propagating the existing `Err`.

    Args:
        op (Callable[[Any], Result[U, E]]): Continuation function (unused for `Err`).

    Returns:
        Err[E]: `Err(self.error)`.
    """
    return Err(self.error)


Result = Ok[T] | Err[E]
AppResult = Result[T, AppError]
