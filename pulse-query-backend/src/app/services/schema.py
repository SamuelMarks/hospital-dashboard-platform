"""
Database Schema Service.

This module is responsible for extracting metadata (tables, columns, types) from the
internal DuckDB instance. It formats this metadata into context strings that enable
the AI/LLM to generate syntactically correct SQL queries corresponding to the
actual data structure.
"""

import asyncio
from typing import Any

import duckdb

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import duckdb_manager


class SchemaService:
  """
  Service class for inspecting the DuckDB schema.
  Provides methods to retrieve schema information in both text (for LLM context)
  and JSON (for UI builders) formats.
  """

  def __init__(self) -> None:
    """
    Initialize the SchemaService with the global DuckDB manager.
    """
    self.manager = duckdb_manager

  def get_schema_context_result(self, conn: duckdb.DuckDBPyConnection | None = None) -> AppResult[str]:
    """
    Generates the LLM system prompt schema context string wrapped in an `AppResult[str]`.

    Args:
        conn (duckdb.DuckDBPyConnection | None): Optional pre-opened DuckDB connection.

    Returns:
        AppResult[str]: `Ok(schema_string)` on success, or `Err(AppError)` on DuckDB failure.
    """
    owns_conn = conn is None
    active_conn = conn if conn is not None else self.manager.get_readonly_connection()
    try:
      # 0. Get all tables
      tables = active_conn.execute("SHOW TABLES").fetchall()
      schema_lines: list[str] = []

      if not tables:
        schema_lines.append("No tables found in the database.")
      else:
        for (table_name,) in tables:
          schema_lines.append(f"Table: {table_name}")

          # 1. Get columns for this table
          # DESCRIBE returns: column_name, column_type, null, key, default, extra
          columns = active_conn.execute(f"DESCRIBE {table_name}").fetchall()

          for col in columns:
            col_name = col[0]
            col_type = col[1]
            schema_lines.append(f"- {col_name} ({col_type})")

          schema_lines.append("")  # Empty line between tables

      # 2. MONOLITHIC PATTERNS (The "Cheat Sheet" for 8B Models)
      domain_logic = (
        "\n--- STANDARD SQL RECIPES (ADAPT THESE) ---\n"
        "RECIPE 1: CAPACITY & OCCUPANCY (Mental Model: Max Historic vs Current)\n"
        "Use when asked: 'Available beds', 'Capacity', 'Full units'\n"
        "WITH historic_peaks AS (\n"
        "    SELECT Location, MAX(daily_census) as capacity \n"
        "    FROM (SELECT Location, CAST(Midnight_Census_DateTime AS DATE), COUNT(*) as daily_census FROM synthetic_hospital_data GROUP BY 1,2) \n"
        "    GROUP BY 1\n"
        "),\n"
        "current_census AS (\n"
        "    SELECT Location, COUNT(*) as occupied \n"
        "    FROM synthetic_hospital_data \n"
        "    WHERE Midnight_Census_DateTime = (SELECT MAX(Midnight_Census_DateTime) FROM synthetic_hospital_data)\n"
        "    GROUP BY 1\n"
        ")\n"
        "SELECT p.Location, (p.capacity - COALESCE(c.occupied, 0)) as available\n"
        "FROM historic_peaks p \n"
        "LEFT JOIN current_census c ON p.Location = c.Location;\n"
        "\n"
        "RECIPE 2: BOTTLENECKS & FLOW (Mental Model: Filtered Aggregates)\n"
        "Use when asked: 'Bottlenecks', 'Throughput', 'Admits vs Discharges'\n"
        "SELECT \n"
        "    Clinical_Service, \n"
        "    SUM(1) FILTER (WHERE Admit_DT IS NOT NULL) as admits,\n"
        "    SUM(1) FILTER (WHERE Discharge_DT IS NOT NULL) as discharges\n"
        "FROM synthetic_hospital_data\n"
        "GROUP BY 1;\n"
        "\n"
        "RECIPE 3: TIME WINDOWS & TRENDS (Mental Model: Window Functions)\n"
        "Use when asked: 'Moving Average', 'Consecutive Days', 'Spikes'\n"
        "WITH daily AS (\n"
        "    SELECT CAST(Midnight_Census_DateTime AS DATE) as dt, COUNT(*) as val \n"
        "    FROM synthetic_hospital_data GROUP BY 1\n"
        ")\n"
        "SELECT \n"
        "    dt, \n"
        "    val,\n"
        "    AVG(val) OVER (ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as rolling_7_day\n"
        "FROM daily;\n"
        "\n"
        "--- CRITICAL RULES ---\n"
        "1. NO HALLUCINATIONS: Do not use table names like 'hospital', 'beds', or 'rooms'. Use ONLY `synthetic_hospital_data`.\n"
        "2. NO RAW MAX: Do not write `MAX(count)`. Count is a function, not a column. You must aggregate in a CTE first.\n"
        "3. PREFER MACROS: If a specific statistical macro is available (e.g. PROBABILITY), use it instead of writing raw math.\n"
      )

      # 4. Macro Documentation
      macros_doc = (
        "\nAVAILABLE DUCKDB MACROS (Use these for statistical logic):\n"
        "- PROBABILITY(condition) -> float: Returns percentage (0-100) where condition is true.\n"
        "- IS_OUTLIER(val, mean, sd) -> bool: True if value is > 2 standard deviations from mean.\n"
        "- IS_BOTTLENECK(adm, dis) -> bool: True if admissions exceed discharges by >20%.\n"
        "- SAFE_DIV(num, den) -> float: Division handling zero denominator.\n"
        "- MOVING_AVERAGE(val, sort_col) -> float: 7-day simple moving average.\n"
        "- HOLIDAY_DIFF(date_col, m, d) -> int: Days elapsed since specific month/day.\n"
        "- IS_WEEKEND(date_col) -> bool: True if Sat/Sun.\n"
        "- WEEKEND_LAG(date_col) -> bool: True if Fri/Sat (predicting lag).\n"
        "- Z_SCORE(val, mu, sigma) -> float: Standard score calculation.\n"
        "- CORRELATION_MATRIX(x, y) -> float: Pearson correlation.\n"
        "- CONSECUTIVE_OVERLOAD(v1, v2, v3, cap) -> bool: True if 3 consecutive values > cap.\n"
        "- SHIFT_CHANGE(dt, start_hr, end_hr) -> bool: True if timestamp hour is within range.\n"
        "- GENERATE_DATES(start, end) -> TABLE: Date spine for LEFT JOINs.\n"
      )

      # 5. Append Documentation for Optimization UDFs
      functions_doc = (
        "\nAVAILABLE ANALYTIC EXTENSIONS (User Defined Functions):\n"
        "1. OPTIMIZE_ASSIGNMENTS(demand_json, capacity_json, affinity_json, constraints_json) -> JSON String\n"
        "   - Description: Solves linear programming optimization for patient placement.\n"
        "   - Arguments:\n"
        "       - demand_json (VARCHAR): JSON object mapping Service Name to Patient Count (e.g., '{\"Cardio\": 10}').\n"
        "       - capacity_json (VARCHAR): JSON object mapping Unit Name to Bed Capacity (e.g., '{\"ICU\": 5}').\n"
        '       - affinity_json (VARCHAR): JSON object mapping Service->Unit->Score (e.g., \'{"Cardio": {"ICU": 1.0}}\').\n'
        '       - constraints_json (VARCHAR): JSON list of hard rules (e.g., \'[{"type": "force_flow", "service": "Gen_Peds", "unit": "PCU_A", "min": 5}]\').\n'
        "   - Output: A JSON String representing a list of assignment objects.\n"
        "   - Usage Pattern (DuckDB): \n"
        "     Use `unnest(from_json(OPTIMIZE_ASSIGNMENTS(...), '[\"json\"]'))` to convert the result back into rows.\n"
      )

      # 6. Example Patterns
      examples_doc = (
        "\nEXAMPLE QUERIES:\n"
        "1. Calculate Utilization Probability:\n"
        "   SELECT PROBABILITY(cnt > 20) FROM (SELECT CAST(Midnight_Census_DateTime AS DATE), COUNT(*) as cnt FROM synthetic_hospital_data GROUP BY 1);\n"
        "\n"
        "2. Identify Bottlenecks:\n"
        "   SELECT Clinical_Service FROM synthetic_hospital_data GROUP BY 1 HAVING IS_BOTTLENECK(SUM(1), SUM(1));\n"
      )

      return Ok("\n".join(schema_lines) + domain_logic + macros_doc + functions_doc + examples_doc)

    except Exception as e:
      return Err(
        AppError(
          code=ErrorCode.DATABASE_UNAVAILABLE,
          message=f"Error retrieving schema: {e!s}",
          status_code=500,
        )
      )
    finally:
      if owns_conn:
        active_conn.close()

  def get_schema_context_string(self, conn: duckdb.DuckDBPyConnection | None = None) -> str:
    """
    Generates a condensed text representation of the database schema and available
    analytical extensions (UDFs) specifically formatted for LLM System Prompts.

    Args:
        conn (duckdb.DuckDBPyConnection | None): Optional pre-opened DuckDB connection.

    Returns:
        str: The formatted schema context string.
    """
    res = self.get_schema_context_result(conn=conn)
    if isinstance(res, Ok):
      return res.value
    return res.error.message

  async def get_schema_context_string_async(self, conn: duckdb.DuckDBPyConnection | None = None) -> str:
    """
    Asynchronously generates the schema context string in a background worker thread.

    Args:
        conn (duckdb.DuckDBPyConnection | None): Optional pre-opened DuckDB connection.

    Returns:
        str: Formatted schema context string.
    """
    return await asyncio.to_thread(self.get_schema_context_string, conn)

  def get_schema_json(self, conn: duckdb.DuckDBPyConnection | None = None) -> list[dict[str, Any]]:
    """
    Returns structured JSON representation of the database schema.
    Useful for the Frontend SQL Builder UI to display available columns.

    Args:
        conn (duckdb.DuckDBPyConnection | None): Optional pre-opened DuckDB connection.

    Returns:
        list[dict[str, Any]]: List of table objects containing name and columns.
    """
    owns_conn = conn is None
    active_conn = conn if conn is not None else self.manager.get_readonly_connection()
    try:
      tables_list: list[dict[str, Any]] = []
      tables = active_conn.execute("SHOW TABLES").fetchall()

      for (table_name,) in tables:
        cols_data: list[dict[str, str]] = []
        columns = active_conn.execute(f"DESCRIBE {table_name}").fetchall()

        for col in columns:
          cols_data.append({"name": col[0], "type": col[1]})

        tables_list.append({"table_name": table_name, "columns": cols_data})
      return tables_list
    finally:
      if owns_conn:
        active_conn.close()

  async def get_schema_json_async(self, conn: duckdb.DuckDBPyConnection | None = None) -> list[dict[str, Any]]:
    """
    Asynchronously retrieves structured schema metadata in a background worker thread.

    Args:
        conn (duckdb.DuckDBPyConnection | None): Optional pre-opened DuckDB connection.

    Returns:
        list[dict[str, Any]]: List of table metadata dictionaries.
    """
    return await asyncio.to_thread(self.get_schema_json, conn)


# Singleton instance
schema_service = SchemaService()
