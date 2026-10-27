"""
Extended tests for the data ingestion service.
"""

from pathlib import Path

import duckdb
import pytest

from app.schemas.json_types import SqlScalar
from app.services import data_ingestion


class _FakeResult:
  """Stub DuckDB query result returning pre-configured row tuples."""

  def __init__(self, rows: list[tuple[SqlScalar, ...]]) -> None:
    """
    Initializes the fake result with `rows`.

    Args:
        rows (list[tuple[SqlScalar, ...]]): Sequence of result tuples.
    """
    self._rows = rows

  def fetchall(self) -> list[tuple[SqlScalar, ...]]:
    """
    Returns all rows as a list.

    Returns:
        list[tuple[SqlScalar, ...]]: Stored row tuples.
    """
    return list(self._rows)

  def fetchone(self) -> tuple[SqlScalar, ...] | None:
    """
    Returns the first row tuple or None if empty.

    Returns:
        tuple[SqlScalar, ...] | None: First row tuple or None.
    """
    return self._rows[0] if self._rows else None


class _FakeConn:
  """Stub DuckDB connection for simulating targeted SQL statement failures."""

  def __init__(self, fail_on: set[str] | None = None) -> None:
    """
    Initializes the fake connection with substrings that trigger RuntimeError.

    Args:
        fail_on (set[str] | None): Substrings that should raise `RuntimeError("boom")`.
    """
    self.fail_on = fail_on or set()
    self.closed = False

  def execute(self, query: str) -> _FakeResult:
    """
    Simulates SQL execution or raises `RuntimeError` when `query` matches `self.fail_on`.

    Args:
        query (str): SQL query string.

    Returns:
        _FakeResult: Stubbed query result.

    Raises:
        RuntimeError: When `query` contains any token in `self.fail_on`.
    """
    if any(token in query for token in self.fail_on):
      raise RuntimeError("boom")
    if query.strip().upper().startswith("DESCRIBE"):
      return _FakeResult([("Clinical_Service", "VARCHAR"), ("Entry_Point", "VARCHAR")])
    if query.strip().upper().startswith("SELECT COUNT"):
      return _FakeResult([(1,)])
    return _FakeResult([])

  def close(self) -> None:
    """Marks the fake connection as closed."""
    self.closed = True


def _write_minimal_csv(path: Path) -> None:
  """
  Writes a minimal 1-row hospital CSV file to `path`.

  Args:
      path (Path): Target file path.
  """
  nl = chr(10)
  path.write_text(f"Clinical_Service,Entry_Point{nl}Cardio,ER{nl}", encoding="utf-8")


def test_generate_sample_data_creates_file(tmp_path: Path) -> None:
  """Sample data generation should create a CSV with headers."""
  target = tmp_path / "sample.csv"
  data_ingestion.DataIngestionService.generate_sample_data(str(target), rows=2)

  assert target.exists()
  header = target.read_text(encoding="utf-8").splitlines()[0]
  assert "visit_id" in header
  assert "admission_date" in header


def test_generate_sample_data_handles_io_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """IO errors during sample generation should not raise."""
  target = tmp_path / "sample.csv"

  def _boom(file: str, mode: str = "w", newline: str = "", encoding: str = "utf-8") -> None:
    """
    Simulates an `OSError` when opening a file for writing.

    Args:
        file (str): Target file path.
        mode (str): File open mode.
        newline (str): Newline handling string.
        encoding (str): Text encoding.

    Raises:
        OSError: Always raised.
    """
    _ = (file, mode, newline, encoding)
    raise OSError("nope")

  monkeypatch.setattr(data_ingestion, "open", _boom)

  data_ingestion.DataIngestionService.generate_sample_data(str(target), rows=1)
  assert not target.exists()


def test_ingest_all_csvs_generates_sample_and_ingests(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """When no CSVs exist, ingestion should generate and process a default file into DuckDB."""
  data_dir = tmp_path / "data"
  default_csv = data_dir / "hospital_data.csv"
  db_path = str(tmp_path / "sample_ingest.duckdb")

  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))
  monkeypatch.setattr(data_ingestion, "DEFAULT_CSV_PATH", str(default_csv))
  monkeypatch.setattr(data_ingestion, "DEFAULT_CSV_FILENAME", default_csv.name)

  def _fake_generate(filepath: str, rows: int = 1000) -> None:
    """
    Creates a minimal valid CSV at `filepath`.

    Args:
        filepath (str): Target CSV path.
        rows (int): Row count parameter.
    """
    _ = rows
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    _write_minimal_csv(Path(filepath))

  monkeypatch.setattr(
    data_ingestion.DataIngestionService,
    "generate_sample_data",
    staticmethod(_fake_generate),
  )

  monkeypatch.setattr(
    "app.services.data_ingestion.duckdb_manager.get_connection",
    lambda: duckdb.connect(db_path),
  )

  data_ingestion.DataIngestionService.ingest_all_csvs()
  assert default_csv.exists()
  check_conn = duckdb.connect(db_path)
  row = check_conn.execute("SELECT COUNT(*) FROM hospital_data").fetchone()
  assert row is not None
  assert row[0] == 1
  check_conn.close()


def test_ingest_all_csvs_handles_file_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """Per-file execution errors should be caught and logged."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  bad_csv = data_dir / "bad.csv"
  _write_minimal_csv(bad_csv)

  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))

  fake_conn = _FakeConn(fail_on={'CREATE OR REPLACE TABLE "bad"'})
  monkeypatch.setattr("app.services.data_ingestion.duckdb_manager.get_connection", lambda: fake_conn)

  data_ingestion.DataIngestionService.ingest_all_csvs()
  assert fake_conn.closed is True


def test_ingest_all_csvs_handles_fatal_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """Unexpected errors outside the per-file block should be handled."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  good_csv = data_dir / "good.csv"
  _write_minimal_csv(good_csv)

  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))

  fake_conn = _FakeConn()
  monkeypatch.setattr("app.services.data_ingestion.duckdb_manager.get_connection", lambda: fake_conn)

  def _boom(_filename: str) -> str:
    """
    Raises a simulated `ValueError` during table name sanitization.

    Args:
        _filename (str): Input filename.

    Raises:
        ValueError: Always raised.
    """
    raise ValueError("boom")

  monkeypatch.setattr(data_ingestion.DataIngestionService, "_sanitize_table_name", staticmethod(_boom))

  data_ingestion.DataIngestionService.ingest_all_csvs()
  assert fake_conn.closed is True


def test_generate_synthetic_sample_data_creates_file(tmp_path: Path) -> None:
  """Synthetic sample data generation should create a CSV with required columns."""
  target = tmp_path / "synthetic.csv"
  data_ingestion.DataIngestionService.generate_synthetic_sample_data(str(target), rows=5)

  assert target.exists()
  header = target.read_text(encoding="utf-8").splitlines()[0]
  assert "PiCSN" in header
  assert "Midnight_Census_DateTime" in header
  assert "Clinical_Service" in header


def test_generate_synthetic_sample_data_handles_io_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """IO errors during synthetic sample generation should be caught safely."""
  target = tmp_path / "synthetic.csv"

  def _boom(file: str, mode: str = "w", newline: str = "", encoding: str = "utf-8") -> None:
    """
    Simulates an `OSError` when opening the synthetic CSV for writing.

    Args:
        file (str): Target file path.
        mode (str): File open mode.
        newline (str): Newline handling string.
        encoding (str): Text encoding.

    Raises:
        OSError: Always raised.
    """
    _ = (file, mode, newline, encoding)
    raise OSError("cannot write")

  monkeypatch.setattr(data_ingestion, "open", _boom)
  data_ingestion.DataIngestionService.generate_synthetic_sample_data(str(target), rows=1)
  assert not target.exists()


def test_ingest_all_csvs_creates_compatibility_alias_views(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Compatibility views and DuckDB indexes should be created and queryable when hospital_data.csv is ingested."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  h_csv = data_dir / "hospital_data.csv"
  _write_minimal_csv(h_csv)

  db_path = str(tmp_path / "test_views.duckdb")
  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))
  monkeypatch.setattr("app.services.data_ingestion.duckdb_manager.get_connection", lambda: duckdb.connect(db_path))

  data_ingestion.DataIngestionService.ingest_all_csvs()
  check_conn = duckdb.connect(db_path)
  tables = [r[0].lower() for r in check_conn.execute("SHOW TABLES").fetchall()]
  assert "synthetic_hospital_data" in tables
  alias_rows = check_conn.execute("SELECT Clinical_Service, Entry_Point FROM synthetic_hospital_data").fetchall()
  assert alias_rows == [("Cardio", "ER")]
  indexes = [r[0] for r in check_conn.execute("SELECT index_name FROM duckdb_indexes()").fetchall()]
  assert "idx_hospital_data_service" in indexes
  assert "idx_hospital_data_entry" in indexes
  check_conn.close()


def test_ingest_all_csvs_creates_reverse_compatibility_alias_views(
  tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
  """Compatibility view hospital_data should be created and queryable when synthetic_hospital_data exists."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  s_csv = data_dir / "Synthetic_hospital_data.csv"
  _write_minimal_csv(s_csv)

  db_path = str(tmp_path / "test_rev_views.duckdb")
  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))
  monkeypatch.setattr("app.services.data_ingestion.duckdb_manager.get_connection", lambda: duckdb.connect(db_path))

  data_ingestion.DataIngestionService.ingest_all_csvs()
  check_conn = duckdb.connect(db_path)
  tables = [r[0].lower() for r in check_conn.execute("SHOW TABLES").fetchall()]
  assert "hospital_data" in tables
  alias_rows = check_conn.execute("SELECT Clinical_Service, Entry_Point FROM hospital_data").fetchall()
  assert alias_rows == [("Cardio", "ER")]
  check_conn.close()


def test_ingest_all_csvs_handles_alias_view_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Errors during compatibility view creation should be caught safely."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  s_csv = data_dir / "test_table.csv"
  _write_minimal_csv(s_csv)

  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))

  class _ViewFailingConn(_FakeConn):
    """Stub connection that raises on `SHOW TABLES`."""

    def execute(self, query: str) -> _FakeResult:
      """
      Raises `RuntimeError` on `SHOW TABLES`, delegating other queries to `super()`.

      Args:
          query (str): SQL query string.

      Returns:
          _FakeResult: Stubbed result.
      """
      if "SHOW TABLES" in query:
        raise RuntimeError("cannot show tables")
      return super().execute(query)

  fake_conn = _ViewFailingConn()
  monkeypatch.setattr("app.services.data_ingestion.duckdb_manager.get_connection", lambda: fake_conn)
  data_ingestion.DataIngestionService.ingest_all_csvs()
  assert fake_conn.closed is True


def test_data_ingestion_table_without_indexed_columns(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Verifies ingestion of CSV files without Clinical_Service/Entry_Point columns into a real DuckDB table."""
  data_dir = tmp_path / "data_plain"
  data_dir.mkdir()
  plain_csv = data_dir / "tbl.csv"
  nl = chr(10)
  plain_csv.write_text(f"id,value{nl}1,10{nl}2,20{nl}", encoding="utf-8")

  db_path = str(tmp_path / "plain_tbl.duckdb")
  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))
  monkeypatch.setattr("app.services.data_ingestion.duckdb_manager.get_connection", lambda: duckdb.connect(db_path))
  data_ingestion.DataIngestionService.ingest_all_csvs()

  check_conn = duckdb.connect(db_path)
  agg_row = check_conn.execute("SELECT COUNT(*), SUM(value) FROM tbl").fetchone()
  assert agg_row == (2, 30)
  check_conn.close()


def test_ingest_data_method_and_transfers_alias(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  """DataIngestionService.ingest_data() should resolve data_dir and return canonical + aliased table names."""
  data_dir = tmp_path / "custom_data"
  data_dir.mkdir()
  (data_dir / "Synthetic_hospital_data.csv").write_text("col1\nval1\n", encoding="utf-8")
  (data_dir / "Synthetic_hospital_data_transfers.csv").write_text("CSN\n1\n", encoding="utf-8")

  db_path = str(tmp_path / "custom_ingest.duckdb")
  monkeypatch.setattr("app.services.data_ingestion.duckdb_manager.db_path", db_path)

  svc = data_ingestion.DataIngestionService(data_dir=data_dir)
  assert svc.data_dir == data_dir.resolve()

  # 1. Explicit data_dir argument
  tables = svc.ingest_data(data_dir=data_dir)
  assert "hospital_data" in tables
  assert "synthetic_hospital_data" in tables
  assert "synthetic_hospital_data_transfers" in tables
  assert "Synthetic_hospital_data_transfers" in tables

  # 2. Default self.data_dir resolution when DATA_DIR is unchanged
  tables_default = svc.ingest_data()
  assert "Synthetic_hospital_data_transfers" in tables_default
