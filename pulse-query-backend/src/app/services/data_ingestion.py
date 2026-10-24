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

from builtins import open as open
import csv
from datetime import datetime, timedelta
import logging
import os
from pathlib import Path
import random
import re

from app.core.config import BACKEND_ROOT
from app.core.diagnostics import (
  diagnostics_registry,
  format_missing_data_warning_banner,
)
from app.database.duckdb import DuckDBConnectionProtocol, duckdb_manager

logger = logging.getLogger("data_ingestion")

PROJECT_ROOT = str(BACKEND_ROOT)
DATA_DIR = str(BACKEND_ROOT / "data")
DEFAULT_CSV_FILENAME = "hospital_data.csv"
DEFAULT_CSV_PATH = os.path.join(DATA_DIR, DEFAULT_CSV_FILENAME)


class DataIngestionService:
  """
  Service responsible for synchronizing the flat-file data layer (CSVs)
  with the in-memory or persisted DuckDB instance.
  """

  def __init__(self, data_dir: str | Path | None = None) -> None:
    """
    Initializes the data ingestion service with a resolved `data_dir` path.

    Args:
        data_dir (str | Path | None): Optional directory path override; defaults to `BACKEND_ROOT / "data"`.
    """
    self.data_dir: Path = Path(data_dir).resolve() if data_dir is not None else (BACKEND_ROOT / "data").resolve()

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
    nl = chr(10)
    banner = format_missing_data_warning_banner(DEFAULT_CSV_FILENAME, filepath, rows)
    logger.warning(f"{nl}{banner}")
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

  @staticmethod
  def generate_synthetic_sample_data(filepath: str, rows: int = 1000) -> None:
    """
    Generates dummy synthetic hospital data matching the clinical schema if missing.

    Args:
        filepath (str): Target path to write the CSV.
        rows (int): Number of rows to generate.
    """
    services = ["Cardiology", "Gen_Peds", "Neurology", "Orthopedics", "General Medicine"]
    locations = ["ICU_A", "ICU_B", "PCU_A", "PCU_B", "Ward_1", "Ward_2"]
    entry_points = ["Emergency", "Direct Admit", "Transfer In", "Newborn Inside In Hospital"]
    visit_types = ["Inpatient", "Emergency", "Newborn"]
    care_levels = ["Intensive Care", "Step Down", "Acute Care", "Well Infant Care"]
    unit_categories = ["ICU", "PCU", "Med/Surg"]
    clinical_focuses = ["Critical Care", "General", "Nursery", "Surgical"]

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    try:
      with open(filepath, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(
          [
            "PiCSN",
            "Location",
            "Clinical_Service",
            "Entry_Point",
            "Visit_Type",
            "Midnight_Census_DateTime",
            "Care_Level",
            "Unit_Category",
            "Clinical_Focus",
            "Admit_DT",
            "Discharge_DT",
          ]
        )
        base_dt = datetime.now() - timedelta(days=60)
        for i in range(rows):
          pic_sn = f"3.1415{10000 + i}"
          admit = base_dt + timedelta(days=random.randint(0, 50), hours=random.randint(0, 23))
          los = random.randint(1, 10)
          discharge = admit + timedelta(days=los, hours=random.randint(1, 12))
          census_dt = (admit + timedelta(days=1)).strftime("%Y-%m-%d 23:59:00")

          writer.writerow(
            [
              pic_sn,
              random.choice(locations),
              random.choice(services),
              random.choice(entry_points),
              random.choice(visit_types),
              census_dt,
              random.choice(care_levels),
              random.choice(unit_categories),
              random.choice(clinical_focuses),
              admit.strftime("%Y-%m-%d %H:%M:%S"),
              discharge.strftime("%Y-%m-%d %H:%M:%S"),
            ]
          )
      logger.info(f"✅ Synthetic clinical sample data created at {filepath}")
    except OSError as e:
      logger.error(f"❌ Failed to generate synthetic clinical sample data: {e}")

  @classmethod
  def _ingest_single_csv(
    cls,
    conn: DuckDBConnectionProtocol,
    filename: str,
    data_dir: str | None = None,
  ) -> bool:
    """
    Loads a single CSV file from `data_dir` (or `DATA_DIR`) into DuckDB and creates standard indices.

    Args:
        conn (DuckDBConnectionProtocol): Active DuckDB read-write connection.
        filename (str): CSV filename inside `data_dir`.
        data_dir (str | None): Optional directory path override; defaults to `DATA_DIR`.

    Returns:
        bool: True if ingestion succeeded, False if an error occurred.
    """
    target_dir = data_dir if data_dir is not None else DATA_DIR
    filepath = os.path.join(target_dir, filename)
    safe_filepath = filepath.replace("'", "''")
    table_name = cls._sanitize_table_name(filename)
    safe_table = table_name.replace('"', '""')
    logger.info(f"   ... Ingesting {filename} -> Table: '{table_name}'")

    try:
      conn.execute(
        f"CREATE OR REPLACE TABLE \"{safe_table}\" AS SELECT * FROM read_csv_auto('{safe_filepath}', header=True);"
      )

      columns = conn.execute(f'DESCRIBE "{safe_table}"').fetchall()
      col_names = [str(c[0]).lower() for c in columns]

      if "clinical_service" in col_names:
        conn.execute(f'CREATE INDEX IF NOT EXISTS "idx_{safe_table}_service" ON "{safe_table}" (Clinical_Service)')
        logger.info("       Using Index: Clinical_Service")

      if "entry_point" in col_names:
        conn.execute(f'CREATE INDEX IF NOT EXISTS "idx_{safe_table}_entry" ON "{safe_table}" (Entry_Point)')
        logger.info("       Using Index: Entry_Point")

      count = conn.execute(f'SELECT count(*) FROM "{safe_table}"').fetchone()
      row_count = int(count[0]) if count else 0
      logger.info(f"       ✅ Loaded {row_count} rows.")
      diagnostics_registry.data_status["row_counts"][table_name] = row_count
      return True
    except Exception as e:
      logger.error(f"       ❌ Failed to load {filename}: {e}")
      diagnostics_registry.add_warning(
        code="CSV_INGESTION_FAILED",
        message=f"Failed to ingest CSV '{filename}': {e}",
        severity="error",
        remediation=f"Verify CSV syntax and encoding for {filename}.",
      )
      return False

  @classmethod
  def _ensure_alias_views(cls, conn: DuckDBConnectionProtocol) -> None:
    """
    Creates compatibility alias views between `synthetic_hospital_data` and `hospital_data`.

    Args:
        conn (DuckDBConnectionProtocol): Active DuckDB read-write connection.
    """
    try:
      existing_tables = [str(c[0]).lower() for c in conn.execute("SHOW TABLES").fetchall()]
      if "synthetic_hospital_data" in existing_tables and "hospital_data" not in existing_tables:
        conn.execute('CREATE VIEW "hospital_data" AS SELECT * FROM "synthetic_hospital_data"')
      elif "hospital_data" in existing_tables and "synthetic_hospital_data" not in existing_tables:
        conn.execute('CREATE VIEW "synthetic_hospital_data" AS SELECT * FROM "hospital_data"')
    except Exception as view_err:
      logger.warning(f"Could not create compatibility alias view: {view_err}")

  @classmethod
  def _finalize_ingested_tables(cls, ingested_tables: list[str]) -> list[str]:
    """
    Normalizes alias table names and updates `diagnostics_registry.data_status` after CSV ingestion.

    Args:
        ingested_tables (list[str]): Raw list of sanitized table names ingested in the batch.

    Returns:
        list[str]: Final list of available table names including compatibility aliases.
    """
    if "synthetic_hospital_data" in ingested_tables and "hospital_data" not in ingested_tables:
      ingested_tables.append("hospital_data")
    elif "hospital_data" in ingested_tables and "synthetic_hospital_data" not in ingested_tables:
      ingested_tables.append("synthetic_hospital_data")

    if "synthetic_hospital_data_transfers" in ingested_tables:
      ingested_tables.append("Synthetic_hospital_data_transfers")
      transfers_cnt = diagnostics_registry.data_status["row_counts"].get("synthetic_hospital_data_transfers", 0)
      diagnostics_registry.data_status["row_counts"]["Synthetic_hospital_data_transfers"] = transfers_cnt

    diagnostics_registry.data_status["tables"] = list(ingested_tables)
    diagnostics_registry.data_status["table_count"] = len({t.lower() for t in ingested_tables})
    diagnostics_registry.data_status["status"] = "ready" if ingested_tables else "empty"
    return ingested_tables

  @classmethod
  def ingest_all_csvs(cls, data_dir: str | None = None) -> list[str]:
    """
    Scans the data directory and loads every `.csv` file into DuckDB as a table.
    Optimizes query performance by creating indices on key dimension columns.

    Args:
        data_dir (str | None): Optional directory path override; defaults to `DATA_DIR`.

    Returns:
        list[str]: List of ingested table names in DuckDB.
    """
    target_dir = data_dir if data_dir is not None else DATA_DIR
    logger.info(f"🚀 Starting Auto-Ingestion from {target_dir}")

    if not os.path.exists(target_dir):
      os.makedirs(target_dir)

    csv_files = [f for f in os.listdir(target_dir) if f.lower().endswith(".csv")]
    if not csv_files:
      default_csv_path = os.path.join(target_dir, DEFAULT_CSV_FILENAME) if data_dir is not None else DEFAULT_CSV_PATH
      cls.generate_sample_data(default_csv_path)
      synthetic_path = os.path.join(target_dir, "Synthetic_hospital_data.csv")
      cls.generate_synthetic_sample_data(synthetic_path)
      csv_files = [DEFAULT_CSV_FILENAME, "Synthetic_hospital_data.csv"]
    elif DEFAULT_CSV_FILENAME in csv_files:
      diagnostics_registry.data_status["has_default_data"] = True
    else:
      diagnostics_registry.add_warning(
        code="DEFAULT_HOSPITAL_DATA_MISSING",
        message=f"'{DEFAULT_CSV_FILENAME}' not found in data directory. Queries targeting hospital_data may fail.",
        severity="warning",
        remediation="Place hospital_data.csv in pulse-query-backend/data/.",
      )

    ingested_tables: list[str] = []
    with duckdb_manager._write_lock:
      conn = duckdb_manager.get_connection()
      files_processed = 0

      try:
        for filename in csv_files:
          if cls._ingest_single_csv(conn, filename, data_dir=target_dir):
            files_processed += 1
            ingested_tables.append(cls._sanitize_table_name(filename))

        cls._ensure_alias_views(conn)
        cls._finalize_ingested_tables(ingested_tables)
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

    return ingested_tables

  def ingest_data(self, data_dir: str | Path | None = None) -> list[str]:
    """
    Ingests CSV files from `data_dir` (or `self.data_dir`) into DuckDB and returns table names.

    Args:
        data_dir (str | Path | None): Optional directory path override.

    Returns:
        list[str]: List of ingested table names in DuckDB.
    """
    default_dir = str(BACKEND_ROOT / "data")
    if data_dir is not None:
      resolved_dir = str(Path(data_dir).resolve())
    elif default_dir != DATA_DIR:
      resolved_dir = DATA_DIR
    else:
      resolved_dir = str(self.data_dir)
    return self.ingest_all_csvs(data_dir=resolved_dir)


# Singleton instance
data_ingestion_service = DataIngestionService()
