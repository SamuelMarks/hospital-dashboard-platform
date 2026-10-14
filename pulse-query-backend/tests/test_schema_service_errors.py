"""
Tests for schema service error handling.
"""

from typing import Any

from app.services.schema import SchemaService


class _FailingConn:
  def execute(self, *_args: Any, **_kwargs: Any) -> None:
    """
    Verify execute behavior.

    Args:
        _args: Test parameter or fixture.
        _kwargs: Test parameter or fixture.
    """
    raise RuntimeError("boom")

  def close(self) -> None:
    """Verify close behavior."""
    pass


class _FailingManager:
  def get_readonly_connection(self) -> Any:
    """Verify get readonly connection behavior."""
    return _FailingConn()


class _EmptySchemaConn:
  def execute(self, query: str) -> Any:
    """
    Verify execute behavior.

    Args:
        query: Test parameter or fixture.
    """

    class _Result:
      def fetchall(self_inner: Any) -> Any:
        """
        Verify fetchall behavior.

        Args:
            self_inner: Test parameter or fixture.
        """
        return []

    return _Result()

  def close(self) -> None:
    """Verify close behavior."""
    pass


class _EmptySchemaManager:
  def get_readonly_connection(self) -> Any:
    """Verify get readonly connection behavior."""
    return _EmptySchemaConn()


class _SchemaConn:
  def __init__(self) -> None:
    """Verify init behavior."""
    self.closed = False

  def execute(self, query: str) -> Any:
    """
    Verify execute behavior.

    Args:
        query: Test parameter or fixture.
    """

    class _Result:
      def __init__(self, rows: Any) -> None:
        """
        Verify init behavior.

        Args:
            rows: Test parameter or fixture.
        """
        self._rows = rows

      def fetchall(self_inner: Any) -> Any:
        """
        Verify fetchall behavior.

        Args:
            self_inner: Test parameter or fixture.
        """
        return list(self_inner._rows)

    if query.strip().upper().startswith("SHOW TABLES"):
      return _Result([("patients",)])
    return _Result([("id", "INTEGER"), ("name", "VARCHAR")])

  def close(self) -> None:
    """Verify close behavior."""
    self.closed = True


class _SchemaManager:
  def __init__(self) -> None:
    """Verify init behavior."""
    self.conn = _SchemaConn()

  def get_readonly_connection(self) -> Any:
    """Verify get readonly connection behavior."""
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
  """get_schema_json should return structured table metadata."""
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
