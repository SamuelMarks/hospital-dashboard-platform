"""
Tests for schema service error handling.
"""

from app.database.duckdb import DuckDBFetchableProtocol
from app.schemas.json_types import SqlScalar
from app.services.schema import SchemaService


class _FailingConn:
  """Stub DuckDB connection that raises `RuntimeError` on `execute`."""

  def execute(self, _query: str) -> DuckDBFetchableProtocol:
    """
    Raises `RuntimeError("boom")` on every query.

    Args:
        _query (str): SQL query string.

    Returns:
        DuckDBFetchableProtocol: Never returns.

    Raises:
        RuntimeError: Always raised.
    """
    raise RuntimeError("boom")

  def close(self) -> None:
    """No-op close hook."""


class _FailingManager:
  """Stub DuckDB manager returning `_FailingConn`."""

  def get_readonly_connection(self) -> _FailingConn:
    """
    Returns a `_FailingConn` instance.

    Returns:
        _FailingConn: Failing connection stub.
    """
    return _FailingConn()


class _EmptyResult:
  """Stub DuckDB query result returning an empty list."""

  def fetchall(self) -> list[tuple[SqlScalar, ...]]:
    """
    Returns an empty list of rows.

    Returns:
        list[tuple[SqlScalar, ...]]: Empty list.
    """
    return []

  def fetchone(self) -> tuple[SqlScalar, ...] | None:
    """
    Returns None for an empty result set.

    Returns:
        tuple[SqlScalar, ...] | None: Always None.
    """
    return None


class _EmptySchemaConn:
  """Stub DuckDB connection returning zero tables."""

  def execute(self, _query: str) -> _EmptyResult:
    """
    Returns an `_EmptyResult` for any query.

    Args:
        _query (str): SQL query string.

    Returns:
        _EmptyResult: Empty query result stub.
    """
    return _EmptyResult()

  def close(self) -> None:
    """No-op close hook."""


class _EmptySchemaManager:
  """Stub DuckDB manager returning `_EmptySchemaConn`."""

  def get_readonly_connection(self) -> _EmptySchemaConn:
    """
    Returns an `_EmptySchemaConn` instance.

    Returns:
        _EmptySchemaConn: Empty schema connection stub.
    """
    return _EmptySchemaConn()


class _RowsResult:
  """Stub DuckDB query result returning pre-configured row tuples."""

  def __init__(self, rows: list[tuple[SqlScalar, ...]]) -> None:
    """
    Initializes the result stub with `rows`.

    Args:
        rows (list[tuple[SqlScalar, ...]]): List of row tuples.
    """
    self._rows = rows

  def fetchall(self) -> list[tuple[SqlScalar, ...]]:
    """
    Returns a copy of `self._rows`.

    Returns:
        list[tuple[SqlScalar, ...]]: Stored row tuples.
    """
    return list(self._rows)

  def fetchone(self) -> tuple[SqlScalar, ...] | None:
    """
    Returns the first row tuple or None.

    Returns:
        tuple[SqlScalar, ...] | None: First row tuple or None.
    """
    return self._rows[0] if self._rows else None


class _SchemaConn:
  """Stub DuckDB connection returning a single `patients` table and two columns."""

  def __init__(self) -> None:
    """Initializes `self.closed` to False."""
    self.closed = False

  def execute(self, query: str) -> _RowsResult:
    """
    Returns table list for `SHOW TABLES` and column tuples for `DESCRIBE`.

    Args:
        query (str): SQL query string.

    Returns:
        _RowsResult: Stubbed rows result.
    """
    if query.strip().upper().startswith("SHOW TABLES"):
      return _RowsResult([("patients",)])
    return _RowsResult([("id", "INTEGER"), ("name", "VARCHAR")])

  def close(self) -> None:
    """Marks `self.closed = True`."""
    self.closed = True


class _SchemaManager:
  """Stub DuckDB manager returning `_SchemaConn`."""

  def __init__(self) -> None:
    """Initializes `self.conn` with a `_SchemaConn` instance."""
    self.conn = _SchemaConn()

  def get_readonly_connection(self) -> _SchemaConn:
    """
    Returns `self.conn`.

    Returns:
        _SchemaConn: Active schema connection stub.
    """
    return self.conn


def test_schema_context_returns_error_on_failure() -> None:
  """Schema context should return a friendly error string on exceptions."""
  svc = SchemaService()
  svc.manager = _FailingManager()

  result = svc.get_schema_context_string()
  assert result.startswith("Error retrieving schema:")


def test_schema_context_handles_no_tables() -> None:
  """No-table scenarios should return a helpful message."""
  svc = SchemaService()
  svc.manager = _EmptySchemaManager()

  result = svc.get_schema_context_string()
  assert "No tables found in the database." in result


def test_schema_json_returns_table_metadata() -> None:
  """`get_schema_json` should return structured table metadata."""
  svc = SchemaService()
  manager = _SchemaManager()
  svc.manager = manager

  result = svc.get_schema_json()

  assert result == [
    {"table_name": "patients", "columns": [{"name": "id", "type": "INTEGER"}, {"name": "name", "type": "VARCHAR"}]}
  ]
  assert manager.conn.closed is True


async def test_schema_service_injected_conn_and_async_helpers() -> None:
  """Verifies injected DuckDB connections are not closed by `SchemaService` and async helpers work."""
  svc = SchemaService()
  injected_conn = _SchemaConn()

  ctx_str = await svc.get_schema_context_string_async(conn=injected_conn)
  assert "Table: patients" in ctx_str
  assert injected_conn.closed is False

  json_res = await svc.get_schema_json_async(conn=injected_conn)
  assert len(json_res) == 1
  assert json_res[0]["table_name"] == "patients"
  assert injected_conn.closed is False
