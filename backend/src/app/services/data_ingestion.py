"""
Data Ingestion Service.

This module works automatically at application startup to populate the
DuckDB OLAP database with any CSV files found in the `backend/data` directory.
It handles:
1. Detecting CSV files.
2. Sanitizing filenames into valid SQL table names.
3. Creating tables (idempotently).
4. Creating indices for critical dimension columns (Service, Entry_Point).
5. Generating sample data if the directory is empty.
"""

import os
import re
import csv
import random
import logging
from datetime import datetime, timedelta
from typing import List

from app.core.config import settings
from app.database.duckdb import duckdb_manager

logger = logging.getLogger("data_ingestion")

# Calculate paths relative to this file location: backend/src/app/services/
# We want to reach: backend/data
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
    logger.warning(f"⚠️ {DEFAULT_CSV_FILENAME} not found. Generating sample data...")

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
    except IOError as e:
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
          logger.info(f"       ✅ Loaded {count[0] if count else 0} rows.")
          files_processed += 1
        except Exception as e:
          logger.error(f"       ❌ Failed to load {filename}: {e}")

      logger.info(f"✅ Ingestion Complete. {files_processed} files processed.")

    except Exception as e:
      logger.critical(f"❌ Fatal error during ingestion: {e}")
    finally:
      conn.close()


# Singleton instance
data_ingestion_service = DataIngestionService()
