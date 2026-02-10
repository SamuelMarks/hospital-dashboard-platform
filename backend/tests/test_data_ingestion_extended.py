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
    raise IOError("nope")

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
