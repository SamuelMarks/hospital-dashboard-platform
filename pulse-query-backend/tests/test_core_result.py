"""
Unit tests for `app.core.result` (`Ok`, `Err`, `Result`, `ErrorCode`, `AppError`, `unwrap_or_raise_http`).
"""

import pytest
from fastapi import HTTPException

from app.core.result import AppError, Err, ErrorCode, Ok, Result, unwrap_or_raise_http


def test_ok_methods() -> None:
  """Verifies `Ok` variant methods (`is_ok`, `is_err`, `unwrap_or`, `map`, `map_err`, `and_then`)."""
  res: Result[int, str] = Ok(10)
  assert res.is_ok() is True
  assert res.is_err() is False
  assert res.unwrap_or(0) == 10

  mapped = res.map(lambda x: x * 2)
  assert isinstance(mapped, Ok)
  assert mapped.value == 20

  mapped_err = res.map_err(lambda e: f"err: {e}")
  assert isinstance(mapped_err, Ok)
  assert mapped_err.value == 10

  chained = res.and_then(lambda x: Ok(x + 5))
  assert isinstance(chained, Ok)
  assert chained.value == 15


def test_err_methods() -> None:
  """Verifies `Err` variant methods (`is_ok`, `is_err`, `unwrap_or`, `map`, `map_err`, `and_then`)."""
  err_obj = AppError(
    code=ErrorCode.VALIDATION_ERROR,
    message="Invalid parameter",
    status_code=422,
    details={"field": "limit"},
  )
  res: Result[int, AppError] = Err(err_obj)
  assert res.is_ok() is False
  assert res.is_err() is True
  assert res.unwrap_or(99) == 99

  mapped = res.map(lambda x: x * 2)
  assert isinstance(mapped, Err)
  assert mapped.error == err_obj

  mapped_err = res.map_err(lambda e: e.message.upper())
  assert isinstance(mapped_err, Err)
  assert mapped_err.error == "INVALID PARAMETER"

  chained = res.and_then(lambda x: Ok(x + 5))
  assert isinstance(chained, Err)
  assert chained.error == err_obj


def test_unwrap_or_raise_http() -> None:
  """Verifies `unwrap_or_raise_http` returns value on `Ok` and raises `HTTPException` on `Err`."""
  ok_res: Result[str, AppError] = Ok("healthy")
  assert unwrap_or_raise_http(ok_res) == "healthy"

  err_res: Result[str, AppError] = Err(
    AppError(
      code=ErrorCode.AUTH_INVALID_TOKEN,
      message="Invalid credentials",
      status_code=401,
    )
  )
  with pytest.raises(HTTPException) as exc:
    unwrap_or_raise_http(err_res, headers={"WWW-Authenticate": "Bearer"})

  assert exc.value.status_code == 401
  assert exc.value.detail == "Invalid credentials"
  assert exc.value.headers == {"WWW-Authenticate": "Bearer"}
