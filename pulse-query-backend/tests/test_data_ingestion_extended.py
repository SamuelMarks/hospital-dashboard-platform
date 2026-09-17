"""
Extended tests for the data ingestion service.
"""

from pathlib import Path

import duckdb

from app.services import data_ingestion


class _FakeResult:
  def __init__(self, rows):
    self._rows = rows

  def fetchall(self):
    return list(self._rows)

  def fetchone(self):
    return self._rows[0] if self._rows else None


class _FakeConn:
  def __init__(self, fail_on=None):
    self.fail_on = fail_on or set()
    self.closed = False

  def execute(self, query: str):
    if any(token in query for token in self.fail_on):
      raise RuntimeError("boom")
    if query.strip().upper().startswith("DESCRIBE"):
      return _FakeResult([("Clinical_Service", "VARCHAR"), ("Entry_Point", "VARCHAR")])
    if query.strip().upper().startswith("SELECT COUNT"):
      return _FakeResult([(1,)])
    return _FakeResult([])

  def close(self):
    self.closed = True


def _write_minimal_csv(path: Path) -> None:
  path.write_text("Clinical_Service,Entry_Point\nCardio,ER\n", encoding="utf-8")


def test_generate_sample_data_creates_file(tmp_path) -> None:
  """Sample data generation should create a CSV with headers."""
  target = tmp_path / "sample.csv"
  data_ingestion.DataIngestionService.generate_sample_data(str(target), rows=2)

  assert target.exists()
  header = target.read_text(encoding="utf-8").splitlines()[0]
  assert "visit_id" in header
  assert "admission_date" in header


def test_generate_sample_data_handles_io_error(monkeypatch, tmp_path) -> None:
  """IO errors during sample generation should not raise."""
  target = tmp_path / "sample.csv"

  def _boom(*args, **kwargs):
    raise OSError("nope")

  monkeypatch.setattr(data_ingestion, "open", _boom)

  data_ingestion.DataIngestionService.generate_sample_data(str(target), rows=1)
  assert not target.exists()


def test_ingest_all_csvs_generates_sample_and_ingests(monkeypatch, tmp_path) -> None:
  """When no CSVs exist, ingestion should generate and process a default file."""
  data_dir = tmp_path / "data"
  default_csv = data_dir / "hospital_data.csv"

  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))
  monkeypatch.setattr(data_ingestion, "DEFAULT_CSV_PATH", str(default_csv))
  monkeypatch.setattr(data_ingestion, "DEFAULT_CSV_FILENAME", default_csv.name)

  def _fake_generate(filepath: str, rows: int = 1000) -> None:
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    _write_minimal_csv(Path(filepath))

  monkeypatch.setattr(
    data_ingestion.DataIngestionService,
    "generate_sample_data",
    staticmethod(_fake_generate),
  )

  monkeypatch.setattr(
    data_ingestion.duckdb_manager,
    "get_connection",
    lambda: duckdb.connect(":memory:"),
  )

  data_ingestion.DataIngestionService.ingest_all_csvs()
  assert default_csv.exists()


def test_ingest_all_csvs_handles_file_error(monkeypatch, tmp_path) -> None:
  """Per-file execution errors should be caught and logged."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  bad_csv = data_dir / "bad.csv"
  _write_minimal_csv(bad_csv)

  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))

  fake_conn = _FakeConn(fail_on={"CREATE OR REPLACE TABLE bad"})
  monkeypatch.setattr(data_ingestion.duckdb_manager, "get_connection", lambda: fake_conn)

  data_ingestion.DataIngestionService.ingest_all_csvs()
  assert fake_conn.closed is True


def test_ingest_all_csvs_handles_fatal_error(monkeypatch, tmp_path) -> None:
  """Unexpected errors outside the per-file block should be handled."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  good_csv = data_dir / "good.csv"
  _write_minimal_csv(good_csv)

  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))

  fake_conn = _FakeConn()
  monkeypatch.setattr(data_ingestion.duckdb_manager, "get_connection", lambda: fake_conn)

  def _boom(_filename: str) -> str:
    raise ValueError("boom")

  monkeypatch.setattr(data_ingestion.DataIngestionService, "_sanitize_table_name", staticmethod(_boom))

  data_ingestion.DataIngestionService.ingest_all_csvs()
  assert fake_conn.closed is True


def test_generate_synthetic_sample_data_creates_file(tmp_path) -> None:
  """Synthetic sample data generation should create a CSV with required columns."""
  target = tmp_path / "synthetic.csv"
  data_ingestion.DataIngestionService.generate_synthetic_sample_data(str(target), rows=5)

  assert target.exists()
  header = target.read_text(encoding="utf-8").splitlines()[0]
  assert "PiCSN" in header
  assert "Midnight_Census_DateTime" in header
  assert "Clinical_Service" in header


def test_generate_synthetic_sample_data_handles_io_error(monkeypatch, tmp_path) -> None:
  """IO errors during synthetic sample generation should be caught safely."""
  target = tmp_path / "synthetic.csv"

  def _boom(*args, **kwargs):
    raise OSError("cannot write")

  monkeypatch.setattr(data_ingestion, "open", _boom)
  data_ingestion.DataIngestionService.generate_synthetic_sample_data(str(target), rows=1)
  assert not target.exists()


def test_ingest_all_csvs_creates_compatibility_alias_views(tmp_path, monkeypatch) -> None:
  """Compatibility views should be created when one table exists and the other does not."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  h_csv = data_dir / "hospital_data.csv"
  _write_minimal_csv(h_csv)

  db_path = str(tmp_path / "test_views.duckdb")
  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))
  monkeypatch.setattr(data_ingestion.duckdb_manager, "get_connection", lambda: duckdb.connect(db_path))

  data_ingestion.DataIngestionService.ingest_all_csvs()
  check_conn = duckdb.connect(db_path)
  tables = [r[0].lower() for r in check_conn.execute("SHOW TABLES").fetchall()]
  assert "synthetic_hospital_data" in tables
  check_conn.close()


def test_ingest_all_csvs_creates_reverse_compatibility_alias_views(tmp_path, monkeypatch) -> None:
  """Compatibility view hospital_data should be created when synthetic_hospital_data exists."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  s_csv = data_dir / "Synthetic_hospital_data.csv"
  _write_minimal_csv(s_csv)

  db_path = str(tmp_path / "test_rev_views.duckdb")
  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))
  monkeypatch.setattr(data_ingestion.duckdb_manager, "get_connection", lambda: duckdb.connect(db_path))

  data_ingestion.DataIngestionService.ingest_all_csvs()
  check_conn = duckdb.connect(db_path)
  tables = [r[0].lower() for r in check_conn.execute("SHOW TABLES").fetchall()]
  assert "hospital_data" in tables
  check_conn.close()


def test_ingest_all_csvs_handles_alias_view_error(tmp_path, monkeypatch) -> None:
  """Errors during compatibility view creation should be caught safely."""
  data_dir = tmp_path / "data"
  data_dir.mkdir()
  s_csv = data_dir / "test_table.csv"
  _write_minimal_csv(s_csv)

  monkeypatch.setattr(data_ingestion, "DATA_DIR", str(data_dir))

  class _ViewFailingConn(_FakeConn):
    def execute(self, query: str):
      if "SHOW TABLES" in query:
        raise RuntimeError("cannot show tables")
      return super().execute(query)

  fake_conn = _ViewFailingConn()
  monkeypatch.setattr(data_ingestion.duckdb_manager, "get_connection", lambda: fake_conn)
  data_ingestion.DataIngestionService.ingest_all_csvs()
  assert fake_conn.closed is True
