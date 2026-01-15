"""
Ingestion Script Wrapper.

This script allows manual execution of the data ingestion process via the command line.
It wraps the core logic located in `app.services.data_ingestion`.

Usage:
    uv run python scripts/ingest.py
"""

import sys
import os
import logging

# Ensure backend modules are resolvable
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

from app.services.data_ingestion import data_ingestion_service

# Configure simple logging for CLI output
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

if __name__ == "__main__":
  print("----- Manual Ingestion Triggered -----")
  try:
    data_ingestion_service.ingest_all_csvs()
    print("----- Manual Ingestion Finished -----")
  except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
