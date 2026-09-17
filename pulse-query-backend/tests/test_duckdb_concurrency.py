"""
Tests for DuckDB Multi-Threaded Concurrency and File Contention.

Verifies that concurrent read-only analytical queries and write operations
execute safely without deadlock or database file corruption.
"""

import concurrent.futures
import os
import tempfile
from typing import Any

from app.database.duckdb import DuckDBManager


def _run_worker_query(db_path: str, thread_idx: int) -> dict[str, Any]:
  """
  Worker task executing analytical queries over an isolated readonly connection.

  Args:
      db_path (str): File path to the DuckDB database.
      thread_idx (int): Thread identifier index.

  Returns:
      dict[str, Any]: Execution result summary with thread index and row count.
  """
  manager = DuckDBManager(db_path=db_path)
  conn = manager.get_readonly_connection()
  try:
    cursor = conn.cursor()
    res = cursor.execute(f"SELECT {thread_idx} AS worker_id, COUNT(*) AS cnt FROM census").fetchall()
    return {"worker_id": thread_idx, "rows": len(res), "success": True}
  finally:
    conn.close()


def test_concurrent_readonly_query_execution() -> None:
  """Test executing 15 concurrent readonly queries across worker threads on a populated database."""
  with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as tf:
    temp_path = tf.name
  if os.path.exists(temp_path):
    os.remove(temp_path)

  try:
    # Initialize schema and seed data
    init_manager = DuckDBManager(db_path=temp_path)
    init_conn = init_manager.get_connection()
    init_conn.execute("CREATE TABLE census (id INT, unit VARCHAR)")
    init_conn.execute("INSERT INTO census VALUES (1, 'ICU'), (2, 'ER'), (3, 'Cardiology')")
    init_conn.close()

    num_workers = 15
    results = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
      futures = [executor.submit(_run_worker_query, temp_path, i) for i in range(num_workers)]
      for future in concurrent.futures.as_completed(futures):
        results.append(future.result())

    assert len(results) == num_workers
    assert all(r["success"] for r in results)
  finally:
    if os.path.exists(temp_path):
      try:
        os.remove(temp_path)
      except Exception:
        pass


def test_sequential_write_and_read_isolation() -> None:
  """Test that write commits are immediately visible to subsequent isolated readonly connections."""
  with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as tf:
    temp_path = tf.name
  if os.path.exists(temp_path):
    os.remove(temp_path)

  try:
    manager = DuckDBManager(db_path=temp_path)

    # 1. Write initial rows
    conn1 = manager.get_connection()
    conn1.execute("CREATE TABLE admissions (id INT, patient VARCHAR)")
    conn1.execute("INSERT INTO admissions VALUES (101, 'Patient A')")
    conn1.close()

    # 2. Read back over readonly connection
    read_conn1 = manager.get_readonly_connection()
    count1 = read_conn1.cursor().execute("SELECT COUNT(*) FROM admissions").fetchone()[0]
    read_conn1.close()
    assert count1 == 1

    # 3. Append more rows over write connection
    conn2 = manager.get_connection()
    conn2.execute("INSERT INTO admissions VALUES (102, 'Patient B'), (103, 'Patient C')")
    conn2.close()

    # 4. Read back over new readonly connection
    read_conn2 = manager.get_readonly_connection()
    count2 = read_conn2.cursor().execute("SELECT COUNT(*) FROM admissions").fetchone()[0]
    read_conn2.close()
    assert count2 == 3
  finally:
    if os.path.exists(temp_path):
      try:
        os.remove(temp_path)
      except Exception:
        pass
