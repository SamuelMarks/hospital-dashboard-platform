"""
Strongly typed Result monad and unified domain error hierarchy.

Provides `Ok[T]`, `Err[E]`, `Result[T, E]` (railway-oriented programming),
and the canonical `ErrorCode` enum + `AppError` domain error structure to
represent failures explicitly without relying on untyped exception control flow.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Generic, Never, TypeVar

from fastapi import HTTPException

from app.schemas.json_types import JsonValue

T = TypeVar("T")
U = TypeVar("U")
E = TypeVar("E")
F = TypeVar("F")


class ErrorCode(StrEnum):
  """Canonical error code enumeration for all backend domain operations."""

  DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"
  DUCKDB_STORAGE_ERROR = "DUCKDB_STORAGE_ERROR"
  POSTGRES_UNAVAILABLE = "POSTGRES_UNAVAILABLE"
  SQL_VALIDATION_ERROR = "SQL_VALIDATION_ERROR"
  SQL_EXECUTION_ERROR = "SQL_EXECUTION_ERROR"
  SSRF_BLOCKED = "SSRF_BLOCKED"
  HTTP_EXECUTION_ERROR = "HTTP_EXECUTION_ERROR"
  OPTIMIZATION_INFEASIBLE = "OPTIMIZATION_INFEASIBLE"
  OPTIMIZATION_UNBOUNDED = "OPTIMIZATION_UNBOUNDED"
  OPTIMIZATION_SOLVER_NOT_CONVERGED = "OPTIMIZATION_SOLVER_NOT_CONVERGED"
  OPTIMIZATION_INVALID_CONSTRAINT = "OPTIMIZATION_INVALID_CONSTRAINT"
  OPTIMIZATION_SESSION_NOT_FOUND = "OPTIMIZATION_SESSION_NOT_FOUND"
  OPTIMIZATION_USE_CASE_INVALID = "OPTIMIZATION_USE_CASE_INVALID"
  DES_BASELINE_EVALUATION_ERROR = "DES_BASELINE_EVALUATION_ERROR"
  SURVEY_SUBMISSION_INVALID = "SURVEY_SUBMISSION_INVALID"
  INSTITUTION_PROFILE_NOT_FOUND = "INSTITUTION_PROFILE_NOT_FOUND"
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR"
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR"
  AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS"
  AUTH_INACTIVE_USER = "AUTH_INACTIVE_USER"
  AUTH_USER_EXISTS = "AUTH_USER_EXISTS"
  AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN"
  AUTH_TOKEN_REVOKED = "AUTH_TOKEN_REVOKED"
  AUTH_INSUFFICIENT_ROLE = "AUTH_INSUFFICIENT_ROLE"
  ADMIN_INVALID_SECRET = "ADMIN_INVALID_SECRET"
  ADMIN_SELF_MODIFICATION_FORBIDDEN = "ADMIN_SELF_MODIFICATION_FORBIDDEN"
  ADMIN_INVALID_ROLE = "ADMIN_INVALID_ROLE"
  CONVERSATION_NOT_FOUND = "CONVERSATION_NOT_FOUND"
  MESSAGE_NOT_FOUND = "MESSAGE_NOT_FOUND"
  CANDIDATE_NOT_FOUND = "CANDIDATE_NOT_FOUND"
  CANDIDATE_MESSAGE_MISMATCH = "CANDIDATE_MESSAGE_MISMATCH"
  ALERT_RULE_NOT_FOUND = "ALERT_RULE_NOT_FOUND"
  SHARE_NOT_FOUND = "SHARE_NOT_FOUND"
  SHARE_SELF_FORBIDDEN = "SHARE_SELF_FORBIDDEN"
  SHARE_INVALID_PERMISSION = "SHARE_INVALID_PERMISSION"
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR"
  LLM_PROVIDER_ERROR = "LLM_PROVIDER_ERROR"
  EMAIL_DELIVERY_FAILED = "EMAIL_DELIVERY_FAILED"
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
      details (Mapping[str, JsonValue]): Optional structured diagnostic key-value pairs.
  """

  code: ErrorCode
  message: str
  status_code: int = 400
  details: Mapping[str, JsonValue] = field(default_factory=dict)

  @classmethod
  def from_exception(
    cls,
    exc: BaseException,
    default_code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    status_code: int = 400,
  ) -> AppError:
    """
    Constructs a structured `AppError` from a caught Python `BaseException`.

    Args:
        exc (BaseException): Caught exception instance.
        default_code (ErrorCode): Domain `ErrorCode` to assign.
        status_code (int): HTTP status code associated with the error.

    Returns:
        AppError: Structured domain error with exception class metadata.
    """
    exc_type_name = type(exc).__name__
    return cls(
      code=default_code,
      message=str(exc) or exc_type_name,
      status_code=status_code,
      details={"exception_type": exc_type_name},
    )


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

  def map_err(self, op: Callable[[Never], F]) -> Ok[T]:
    """
    Maps a `Result[T, E]` to `Result[T, F]`, leaving `Ok` untouched.

    Args:
        op (Callable[[Never], F]): Error transformation function (unused for `Ok`).

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

  def map(self, op: Callable[[Never], U]) -> Err[E]:
    """
    Leaves the `Err` value untouched when mapping over the success type.

    Args:
        op (Callable[[Never], U]): Success transformation function (unused for `Err`).

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

  def and_then(self, op: Callable[[Never], Result[U, E]]) -> Err[E]:
    """
    Short-circuits a chained operation, propagating the existing `Err`.

    Args:
        op (Callable[[Never], Result[U, E]]): Continuation function (unused for `Err`).

    Returns:
        Err[E]: `Err(self.error)`.
    """
    return Err(self.error)


Result = Ok[T] | Err[E]
AppResult = Result[T, AppError]


def unwrap_or_raise_http(result: AppResult[T], headers: dict[str, str] | None = None) -> T:
  """
  Unwraps an `AppResult[T]` value or raises a FastAPI `HTTPException` from `AppError`.

  Args:
      result (AppResult[T]): Domain result to unwrap.
      headers (dict[str, str] | None): Optional HTTP response headers to attach on error.

  Returns:
      T: The unwrapped success value when `result` is `Ok[T]`.

  Raises:
      HTTPException: When `result` is `Err[AppError]`, using `status_code` and `message`.
  """
  if isinstance(result, Err):
    raise HTTPException(
      status_code=result.error.status_code,
      detail=result.error.message,
      headers=headers,
    )
  return result.value
