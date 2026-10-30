# Backend Data Documentation

> **Purpose:** This file documents the structure, source, and purpose of the static data assets, CSV files, and JSON manifests used by the backend DuckDB analytical engine and the JAX + MPAX Hospital Operations Optimization platform.

## Current Data Assets

- **`Synthetic_hospital_data.csv`** and **`Synthetic_hospital_data_transfers.csv`**: Completely synthetic datasets representing operational hospital logs (admissions, transfers, discharges).
- **`hospital_data.csv`**: Extended synthetic operational log ingested into DuckDB for census analytics and Quick Actions (`CENSUS_PATIENT_DAYS_BY_UNIT`, `CENSUS_PATIENT_DAYS_BY_SERVICE`, `CENSUS_COMBINED_BREAKDOWN`, `CENSUS_SUMMARY_STATISTICS`).
- **`benchmark_gold.json`**: Gold-standard Text-to-SQL evaluation benchmark definitions.
- **`initial_templates.json`**: Used for seeding standard analytical widget templates during application startup.
- **`optimization_benchmarks.json`**: Gold-standard multi-institutional Hospital Operations Optimization benchmark scenarios across Use Case 1 (`service_unit`), Use Case 2 (`surgical_scheduling` BEDS & POINTS), and Use Case 3 (`staffing_optimization`), generated via `scripts/generate_optimization_benchmarks.py`.
- **`litert_odml_manifest.json`**: On-Device ML (ODML) quantized **LiteRT** (`.litertlm` / `.tflite`) model manifest and TPU instruction-tuning metadata generated via `scripts/train_tpu_optimization_llm.py`.
