"""
Tests for DuckDB Macros.
"""

import pytest
import duckdb
from app.database.duckdb_init import create_hospital_macros


@pytest.fixture
def db_conn():
  conn = duckdb.connect(":memory:")
  create_hospital_macros(conn)
  yield conn
  conn.close()


def test_macro_is_outlier(db_conn):
  """
  Validation for Outlier Logic used in 'Long-Stayers'.
  Logic: abs(val - mean) > 2*SD
  """
  # Mean 10, SD 2. Limit [6, 14]
  # 15 -> 15-10=5. 5 > 4? Yes.
  # 11 -> 11-10=1. 1 > 4? No.

  rows = db_conn.sql("""
        SELECT 
            IS_OUTLIER(15, 10, 2) as o1,
            IS_OUTLIER(11, 10, 2) as o2
    """).fetchone()

  assert rows[0] is True
  assert rows[1] is False
