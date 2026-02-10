"""
Tests for schema service error handling.
"""

from app.services.schema import SchemaService


class _FailingConn:
  def execute(self, *_args, **_kwargs):
    raise RuntimeError("boom")

  def close(self):
    pass


class _FailingManager:
  def get_connection(self):
    return _FailingConn()


class _EmptySchemaConn:
  def execute(self, query: str):
    class _Result:
      def fetchall(self_inner):
        return []

    return _Result()

  def close(self):
    pass


class _EmptySchemaManager:
  def get_connection(self):
    return _EmptySchemaConn()


class _SchemaConn:
  def __init__(self):
    self.closed = False

  def execute(self, query: str):
    class _Result:
      def __init__(self, rows):
        self._rows = rows

      def fetchall(self_inner):
        return list(self_inner._rows)

    if query.strip().upper().startswith("SHOW TABLES"):
      return _Result([("patients",)])
    return _Result([("id", "INTEGER"), ("name", "VARCHAR")])

  def close(self):
    self.closed = True


class _SchemaManager:
  def __init__(self):
    self.conn = _SchemaConn()

  def get_connection(self):
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
