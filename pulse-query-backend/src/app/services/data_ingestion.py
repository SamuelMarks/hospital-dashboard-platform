"""
Data Ingestion Service.

This module works automatically at application startup to populate the
DuckDB OLAP database with any CSV files found in the `pulse-query-backend/data` directory.
It handles:
1. Detecting CSV files.
2. Sanitizing filenames into valid SQL table names.
3. Creating tables (idempotently).
4. Creating indices for critical dimension columns (Service, Entry_Point).
5. Generating sample data if the directory is empty.
"""

import csv
import logging
import os
import random
import re
from builtins import open as open
from datetime import datetime, timedelta

from app.core.diagnostics import (
  diagnostics_registry,
  format_missing_data_warning_banner,
)
from app.database.duckdb import duckdb_manager

logger = logging.getLogger("data_ingestion")

# Calculate paths relative to this file location: pulse-query-backend/src/app/services/
# We want to reach: pulse-query-backend/data
FILE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(FILE_DIR, "..", "..", ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
DEFAULT_CSV_FILENAME = "hospital_data.csv"
DEFAULT_CSV_PATH = os.path.join(DATA_DIR, DEFAULT_CSV_FILENAME)


class DataIngestionService:
  """
  Service responsible for synchronizing the flat-file data layer (CSVs)
  with the in-memory or persisted DuckDB instance.
  """

  @staticmethod
  def _sanitize_table_name(filename: str) -> str:
    """
    Converts a filename into a valid SQL table name.

    Args:
        filename (str): The original filename with extension.

    Returns:
        str: A lower-cased, snake_cased string valid for SQL identifiers.
    """
    name = filename.rsplit(".", 1)[0]
    clean = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    if clean[0].isdigit():
      clean = f"_{clean}"
    return clean.lower()

  @staticmethod
  def generate_sample_data(filepath: str, rows: int = 1000) -> None:
    """
    Generates dummy hospital data if no data exists.
    Ensures the system is playable immediately after a fresh clone.

    Args:
        filepath (str): Target path to write the CSV.
        rows (int): Number of rows to generate.
    """
    banner = format_missing_data_warning_banner(DEFAULT_CSV_FILENAME, filepath, rows)
    logger.warning("\n" + banner)
    diagnostics_registry.data_status["fallback_generated"] = True
    diagnostics_registry.data_status["has_default_data"] = False
    diagnostics_registry.add_warning(
      code="MISSING_DEFAULT_DATA",
      message=f"Default clinical data '{DEFAULT_CSV_FILENAME}' was missing; generated fallback dataset with {rows} rows.",
      severity="warning",
      remediation=f"Place real '{DEFAULT_CSV_FILENAME}' in pulse-query-backend/data/ and re-run ingestion.",
    )

    diagnoses = ["Hypertension", "Type 2 Diabetes", "Fracture", "Viral Infection", "Cardiomyopathy"]
    departments = ["Cardiology", "Orthopedics", "General Practice", "Emergency", "Neurology"]

    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    try:
      with open(filepath, mode="w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(
          [
            "visit_id",
            "patient_id",
            "admission_date",
            "discharge_date",
            "diagnosis",
            "department",
            "billing_amount",
            "age",
            "insurance_provider",
          ]
        )

        base_date = datetime.now() - timedelta(days=365)

        for i in range(rows):
          visit_id = f"VIS-{10000 + i}"
          patient_id = f"PAT-{random.randint(100, 500)}"
          admission = base_date + timedelta(days=random.randint(0, 360))
          los = random.randint(1, 14)
          discharge = admission + timedelta(days=los)

          writer.writerow(
            [
              visit_id,
              patient_id,
              admission.strftime("%Y-%m-%d"),
              discharge.strftime("%Y-%m-%d"),
              random.choice(diagnoses),
              random.choice(departments),
              round(random.uniform(500.0, 50000.0), 2),
              random.randint(18, 90),
              random.choice(["BlueCross", "Medicare", "Aetna", "Self-Pay"]),
            ]
          )
      logger.info(f"✅ Sample data created at {filepath}")
    except OSError as e:
      logger.error(f"❌ Failed to generate sample data: {e}")

  @classmethod
  def ingest_all_csvs(cls) -> None:
    """
    Scans the data directory and loads every `.csv` file into DuckDB as a table.
    Optimizes query performance by creating indices on key dimension columns.
    """
    logger.info(f"🚀 Starting Auto-Ingestion from {DATA_DIR}")

    if not os.path.exists(DATA_DIR):
      os.makedirs(DATA_DIR)

    csv_files = [f for f in os.listdir(DATA_DIR) if f.lower().endswith(".csv")]
    if not csv_files:
      cls.generate_sample_data(DEFAULT_CSV_PATH)
      csv_files = [DEFAULT_CSV_FILENAME]
    elif DEFAULT_CSV_FILENAME in csv_files:
      diagnostics_registry.data_status["has_default_data"] = True
    else:
      diagnostics_registry.add_warning(
        code="DEFAULT_HOSPITAL_DATA_MISSING",
        message=f"'{DEFAULT_CSV_FILENAME}' not found in data directory. Queries targeting hospital_data may fail.",
        severity="warning",
        remediation="Place hospital_data.csv in pulse-query-backend/data/.",
      )

    conn = duckdb_manager.get_connection()
    files_processed = 0

    try:
      for filename in csv_files:
        filepath = os.path.join(DATA_DIR, filename)
        table_name = cls._sanitize_table_name(filename)

        logger.info(f"   ... Ingesting {filename} -> Table: '{table_name}'")

        try:
          # 1. Create/Replace Table from CSV
          conn.execute(f"""
                        CREATE OR REPLACE TABLE {table_name} AS 
                        SELECT * FROM read_csv_auto('{filepath}', header=True); 
                    """)

          # 2. Check for relevant columns and create indices
          # We check metadata first to avoid errors if column doesn't exist
          columns = conn.execute(f"DESCRIBE {table_name}").fetchall()
          col_names = [c[0].lower() for c in columns]

          # Standardize index naming
          # Clinical_Service / department -> Index for Service Mix
          # Entry_Point -> Index for Cohort Analysis

          if "clinical_service" in col_names:
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_service ON {table_name} (Clinical_Service)")
            logger.info("       Using Index: Clinical_Service")

          if "entry_point" in col_names:
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_entry ON {table_name} (Entry_Point)")
            logger.info("       Using Index: Entry_Point")

          count = conn.execute(f"SELECT count(*) FROM {table_name}").fetchone()
          row_count = count[0] if count else 0
          logger.info(f"       ✅ Loaded {row_count} rows.")
          diagnostics_registry.data_status["row_counts"][table_name] = row_count
          files_processed += 1
        except Exception as e:
          logger.error(f"       ❌ Failed to load {filename}: {e}")
          diagnostics_registry.add_warning(
            code="CSV_INGESTION_FAILED",
            message=f"Failed to ingest CSV '{filename}': {e}",
            severity="error",
            remediation=f"Verify CSV syntax and encoding for {filename}.",
          )

      logger.info(f"✅ Ingestion Complete. {files_processed} files processed.")

    except Exception as e:
      logger.critical(f"❌ Fatal error during ingestion: {e}")
      diagnostics_registry.add_warning(
        code="FATAL_INGESTION_ERROR",
        message=f"Fatal error during data ingestion: {e}",
        severity="critical",
        remediation="Check filesystem permissions and database engine state.",
      )
    finally:
      conn.close()


# Singleton instance
data_ingestion_service = DataIngestionService()
