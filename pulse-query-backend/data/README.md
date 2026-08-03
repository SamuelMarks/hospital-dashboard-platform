# Backend Data Documentation

> **Purpose:** This file documents the structure, source, and purpose of the static data assets and CSV files used by the backend DuckDB analytical engine and MPAX simulation solver.

## Current Data Assets

- **`Synthetic_hospital_data.csv`** and **`Synthetic_hospital_data_transfers.csv`**: Completely synthetic datasets provided by the hospital. They represent mock operational logs (admissions, transfers, discharges) and are permitted to be publicly posted anywhere.
- **`hospital_data.csv`**: A synthetic dataset generated via Gemini 3 Pro, acting as an alternative/extended operational log.
- **`benchmark_gold.json`**: Contains gold standard evaluation benchmark definitions.
- **`initial_templates.json`**: Used for seeding standard analytical templates during application startup.
- **`mpax_benchmark_scenarios.json`**: Generated constraint scenarios used by the Multi-LLM Arena to evaluate "What-If" problem solving against the MPAX solver.
