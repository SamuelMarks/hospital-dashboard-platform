from app.services.data_ingestion import DataIngestionService


def test_sanitize_transfers_filename() -> None:
  """Ensure the long transfer filename matches our SQL template expectation."""
  name = "Synthetic_hospital_data_transfers.csv"
  result = DataIngestionService._sanitize_table_name(name)
  assert result == "synthetic_hospital_data_transfers"
