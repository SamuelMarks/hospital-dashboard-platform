"""
Security tests for DuckDB filesystem sandboxing and isolation.
"""

import os
import tempfile

import duckdb
import pytest

from app.database.duckdb import DuckDBManager


def test_duckdb_readonly_blocks_external_filesystem_access() -> None:
  """Test that read-only DuckDB connection rejects arbitrary host file reads."""
  with tempfile.NamedTemporaryFile(suffix=".duckdb") as tmp:
    tmp_path = tmp.name

  try:
    # Initialize DB file with write access
    init_conn = duckdb.connect(tmp_path)
    init_conn.execute("CREATE TABLE safe_table AS SELECT 1 AS id")
    init_conn.close()

    # Open via DuckDBManager in read-only mode
    manager = DuckDBManager(tmp_path)
    conn = manager.get_readonly_connection()

    # Normal table read should succeed
    res = conn.execute("SELECT * FROM safe_table").fetchall()
    assert res == [(1,)]

    # External filesystem reading should fail due to disabled external access
    with pytest.raises(Exception, match=r"(?i)(disabled|permission|cannot access)") as excinfo:
      conn.execute("SELECT * FROM read_csv('/etc/hosts')")

    err_msg = str(excinfo.value).lower()
    assert "disabled" in err_msg or "permission" in err_msg or "cannot access" in err_msg

    conn.close()
  finally:
    if os.path.exists(tmp_path):
      os.remove(tmp_path)


def test_duckdb_in_memory_readonly_sandbox() -> None:
  """Test that :memory: readonly mode is safely sandboxed against both external file reads and write queries."""
  manager = DuckDBManager(":memory:")
  conn = manager.get_readonly_connection()

  res = conn.execute("SELECT 42 AS answer").fetchall()
  assert res == [(42,)]
  row_one = conn.execute("SELECT 7 AS lucky").fetchone()
  assert row_one == (7,)

  cur = conn.cursor()
  assert cur.description is None
  cur.execute("SELECT 1 AS col_a")
  assert cur.description is not None
  assert cur.fetchall() == [(1,)]
  cur.execute("SELECT 2 AS col_b")
  assert cur.fetchone() == (2,)
  cur.close()

  for write_sql in (
    "CREATE TABLE hacked (id INT)",
    "INSERT INTO safe_table VALUES (1)",
    "DROP TABLE IF EXISTS safe_table",
    "ATTACH 'other.db' AS other",
    "COPY (SELECT 1) TO 'out.csv'",
  ):
    with pytest.raises(duckdb.InvalidInputException, match=r"(?i)read-only mode violation"):
      conn.execute(write_sql)

  with pytest.raises(Exception, match=r"(?i)(disabled|permission|cannot access)") as excinfo:
    conn.execute("SELECT * FROM read_csv('/etc/hosts')")

  err_msg = str(excinfo.value).lower()
  assert "disabled" in err_msg or "permission" in err_msg or "cannot access" in err_msg
  conn.close()
