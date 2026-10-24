#!/usr/bin/env python3
"""
Ingestion Script Wrapper.

This script allows manual execution of the data ingestion process via the command line.
It wraps the core logic located in `app.services.data_ingestion`.

Usage:
    uv run python scripts/ingest.py
"""

import logging
import os
from pathlib import Path
import sys

# Ensure backend modules are resolvable
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from app.core.config import settings
from app.database.duckdb import duckdb_manager
from app.services.data_ingestion import data_ingestion_service

# Configure simple logging for CLI output
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

REQUIRED_TABLES: tuple[str, ...] = ("hospital_data", "Synthetic_hospital_data_transfers")


def main() -> None:
  """
  Executes manual CSV ingestion into DuckDB, verifies required clinical tables
  and non-zero row counts, and exits with status 1 on failure.
  """
  print("----- Manual Ingestion Triggered -----")
  try:
    Path(duckdb_manager.db_path or settings.DUCKDB_PATH).parent.mkdir(parents=True, exist_ok=True)
    tables = data_ingestion_service.ingest_data()
    print(f"Ingested tables: {tables}")

    if len(tables) < 2 or any(req not in tables for req in REQUIRED_TABLES):
      print(f"Error: Required clinical tables {REQUIRED_TABLES} missing from {tables}")
      sys.exit(1)

    conn = duckdb_manager.get_readonly_connection()
    try:
      for table_name in REQUIRED_TABLES:
        row = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()
        row_count = int(row[0]) if row else 0
        print(f"Table {table_name}: {row_count} rows")
        if row_count <= 0:
          print(f"Error: Required clinical table {table_name} has {row_count} rows")
          sys.exit(1)
    finally:
      conn.close()

    print("----- Manual Ingestion Finished -----")
  except SystemExit:
    raise
  except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)


if __name__ == "__main__":
  main()
