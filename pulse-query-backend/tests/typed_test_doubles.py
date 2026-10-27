"""
Strongly typed test doubles and context manager base classes for backend unit tests.

Provides reusable `ExcType`, `ExcVal`, and `ExcTb` type aliases alongside
generic synchronous and asynchronous context manager stubs so tests never
rely on `object` or `Any` type annotations.
"""

from types import TracebackType
from typing import Literal

type ExcType = type[BaseException] | None
type ExcVal = BaseException | None
type ExcTb = TracebackType | None


class TypedAsyncContextManager[T]:
  """
  Generic asynchronous context manager test double yielding a pre-configured value.

  Attributes:
      _value (T): Value returned upon entering the async context.
  """

  def __init__(self, value: T) -> None:
    """
    Initializes the async context manager with `value`.

    Args:
        value (T): Value to return from `__aenter__`.
    """
    self._value = value

  async def __aenter__(self) -> T:
    """
    Enters the async context and returns the configured value.

    Returns:
        T: Configured context value.
    """
    return self._value

  async def __aexit__(self, exc_type: ExcType, exc: ExcVal, tb: ExcTb) -> Literal[False]:
    """
    Exits the async context without suppressing exceptions.

    Args:
        exc_type (ExcType): Exception type if raised.
        exc (ExcVal): Exception instance if raised.
        tb (ExcTb): Traceback if raised.

    Returns:
        Literal[False]: Always False so exceptions propagate.
    """
    _ = (exc_type, exc, tb)
    return False


class TypedSyncContextManager[T]:
  """
  Generic synchronous context manager test double yielding a pre-configured value.

  Attributes:
      _value (T): Value returned upon entering the sync context.
  """

  def __init__(self, value: T) -> None:
    """
    Initializes the sync context manager with `value`.

    Args:
        value (T): Value to return from `__enter__`.
    """
    self._value = value

  def __enter__(self) -> T:
    """
    Enters the sync context and returns the configured value.

    Returns:
        T: Configured context value.
    """
    return self._value

  def __exit__(self, exc_type: ExcType, exc: ExcVal, tb: ExcTb) -> Literal[False]:
    """
    Exits the sync context without suppressing exceptions.

    Args:
        exc_type (ExcType): Exception type if raised.
        exc (ExcVal): Exception instance if raised.
        tb (ExcTb): Traceback if raised.

    Returns:
        Literal[False]: Always False so exceptions propagate.
    """
    _ = (exc_type, exc, tb)
    return False


__all__ = [
  "ExcTb",
  "ExcType",
  "ExcVal",
  "TypedAsyncContextManager",
  "TypedSyncContextManager",
]
