"""
Tests for Advanced SQL Patterns.

Verifies the logic required for Theme 7:
1. Gaps & Islands (Utilization Spikes).
2. Complex Window Functions (LAG/LEAD).
3. Correlation Aggregates.
"""

import pytest
import duckdb


@pytest.fixture
def db():
  """In-memory DB with specific test scenarios."""
  conn = duckdb.connect(":memory:")

  # 1. Utilization Table (Date, Rate)
  # We want a sequence: 0.8, 1.1, 1.2, 1.1, 0.9 (Spike of 3 days)
  conn.execute("CREATE TABLE util (dt DATE, rate DOUBLE)")
  conn.execute(
    "INSERT INTO util VALUES ('2023-01-01', 0.8), ('2023-01-02', 1.1), ('2023-01-03', 1.2), ('2023-01-04', 1.1), ('2023-01-05', 0.9)"
  )

  # 2. Sequential Flow Table (Events)
  conn.execute("CREATE TABLE events (id INT, TS TIMESTAMP)")
  conn.execute("INSERT INTO events VALUES (1, '2023-01-01 10:00:00'), (2, '2023-01-01 12:00:00')")  # 2 hour gap

  # 3. Correlation Table
  # Perfect correlation: (1,1), (2,2), (3,3) -> 1.0
  conn.execute("CREATE TABLE corr_test (x DOUBLE, y DOUBLE)")
  conn.execute("INSERT INTO corr_test VALUES (1,1), (2,2), (3,3)")

  yield conn
  conn.close()


def test_utilization_spikes_pattern(db):
  """
  Test finding 3 consecutive days > 1.0 using LEAD.
  """
  query = """
    WITH windows AS (
      SELECT 
        dt, 
        rate,
        LEAD(rate, 1) OVER (ORDER BY dt) as next_1,
        LEAD(rate, 2) OVER (ORDER BY dt) as next_2
      FROM util
    )
    SELECT dt FROM windows
    WHERE rate > 1.0 AND next_1 > 1.0 AND next_2 > 1.0
    """
  res = db.execute(query).fetchall()

  # Based on seeding ('2023-01-02', '2023-01-03', '2023-01-04') are > 1.0
  # The windwo starting at 02 sees 03 and 04. So 02 is the start of the spike.
  assert len(res) == 1
  assert str(res[0][0]) == "2023-01-02"


def test_turnover_lag_logic(db):
  """
  Test calculating time difference between row N and N+1.
  """
  query = """
    SELECT 
        date_diff('minute', TS, LEAD(TS) OVER (ORDER BY TS)) as gap
    FROM events
    LIMIT 1
    """
  res = db.execute(query).fetchone()
  # 10:00 to 12:00 is 120 minutes
  assert res[0] == 120


def test_correlation_function(db):
  """
  Test DuckDB native corr() function works as expected.
  """
  res = db.execute("SELECT corr(x, y) FROM corr_test").fetchone()
  assert res[0] == 1.0
