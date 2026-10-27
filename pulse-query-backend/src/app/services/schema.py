"""
Database Schema Service.

This module is responsible for extracting metadata (tables, columns, types) from the
internal DuckDB instance. It formats this metadata into context strings that enable
the AI/LLM to generate syntactically correct SQL queries corresponding to the
actual data structure.
"""

import asyncio
from typing import Protocol, TypedDict

import duckdb

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.database.duckdb import DuckDBConnectionProtocol, duckdb_manager


class ColumnSchemaDict(TypedDict):
  """Typed dictionary describing a single DuckDB column."""

  name: str
  type: str


class TableSchemaDict(TypedDict):
  """Typed dictionary describing a DuckDB table and its columns."""

  table_name: str
  columns: list[ColumnSchemaDict]


class DuckDBManagerProtocol(Protocol):
  """Protocol describing the DuckDB connection manager interface required by `SchemaService`."""

  def get_readonly_connection(self) -> DuckDBConnectionProtocol:
    """
    Opens and returns a read-only DuckDB connection.

    Returns:
        DuckDBConnectionProtocol: Read-only DuckDB connection.
    """
    ...


class SchemaService:
  """
  Service class for inspecting the DuckDB schema.
  Provides methods to retrieve schema information in both text (for LLM context)
  and JSON (for UI builders) formats.
  """

  def __init__(self, manager: DuckDBManagerProtocol | None = None) -> None:
    """
    Initialize the SchemaService with the global DuckDB manager.

    Args:
        manager (DuckDBManagerProtocol | None): Optional DuckDB manager override.
    """
    self.manager: DuckDBManagerProtocol = manager if manager is not None else duckdb_manager

  def get_schema_context_result(self, conn: DuckDBConnectionProtocol | None = None) -> AppResult[str]:
    """
    Generates the LLM system prompt schema context string wrapped in an `AppResult[str]`.

    Args:
        conn (DuckDBConnectionProtocol | None): Optional pre-opened DuckDB connection.

    Returns:
        AppResult[str]: `Ok(schema_string)` on success, or `Err(AppError)` on DuckDB failure.
    """
    owns_conn = conn is None
    active_conn: DuckDBConnectionProtocol = conn if conn is not None else self.manager.get_readonly_connection()
    nl = chr(10)
    try:
      tables = active_conn.execute("SHOW TABLES").fetchall()
      schema_lines: list[str] = []

      if not tables:
        schema_lines.append("No tables found in the database.")
      else:
        for (table_name,) in tables:
          t_str = str(table_name)
          safe_table = t_str.replace('"', '""')
          schema_lines.append(f"Table: {t_str}")

          columns = active_conn.execute(f'DESCRIBE "{safe_table}"').fetchall()
          for col in columns:
            col_name = col[0]
            col_type = col[1]
            schema_lines.append(f"- {col_name} ({col_type})")

          schema_lines.append("")

      domain_logic = (
        f"{nl}--- STANDARD SQL RECIPES (ADAPT THESE) ---{nl}"
        f"RECIPE 1: CAPACITY & OCCUPANCY (Mental Model: Max Historic vs Current){nl}"
        f"Use when asked: 'Available beds', 'Capacity', 'Full units'{nl}"
        f"WITH historic_peaks AS ({nl}"
        f"    SELECT Location, MAX(daily_census) as capacity {nl}"
        f"    FROM (SELECT Location, CAST(Midnight_Census_DateTime AS DATE), COUNT(*) as daily_census FROM synthetic_hospital_data GROUP BY 1,2) {nl}"
        f"    GROUP BY 1{nl}"
        f"),{nl}"
        f"current_census AS ({nl}"
        f"    SELECT Location, COUNT(*) as occupied {nl}"
        f"    FROM synthetic_hospital_data {nl}"
        f"    WHERE Midnight_Census_DateTime = (SELECT MAX(Midnight_Census_DateTime) FROM synthetic_hospital_data){nl}"
        f"    GROUP BY 1{nl}"
        f"){nl}"
        f"SELECT p.Location, (p.capacity - COALESCE(c.occupied, 0)) as available{nl}"
        f"FROM historic_peaks p {nl}"
        f"LEFT JOIN current_census c ON p.Location = c.Location;{nl}"
        f"{nl}"
        f"RECIPE 2: BOTTLENECKS & FLOW (Mental Model: Filtered Aggregates){nl}"
        f"Use when asked: 'Bottlenecks', 'Throughput', 'Admits vs Discharges'{nl}"
        f"SELECT {nl}"
        f"    Clinical_Service, {nl}"
        f"    SUM(1) FILTER (WHERE Admit_DT IS NOT NULL) as admits,{nl}"
        f"    SUM(1) FILTER (WHERE Discharge_DT IS NOT NULL) as discharges{nl}"
        f"FROM synthetic_hospital_data{nl}"
        f"GROUP BY 1;{nl}"
        f"{nl}"
        f"RECIPE 3: TIME WINDOWS & TRENDS (Mental Model: Window Functions){nl}"
        f"Use when asked: 'Moving Average', 'Consecutive Days', 'Spikes'{nl}"
        f"WITH daily AS ({nl}"
        f"    SELECT CAST(Midnight_Census_DateTime AS DATE) as dt, COUNT(*) as val {nl}"
        f"    FROM synthetic_hospital_data GROUP BY 1{nl}"
        f"){nl}"
        f"SELECT {nl}"
        f"    dt, {nl}"
        f"    val,{nl}"
        f"    AVG(val) OVER (ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as rolling_7_day{nl}"
        f"FROM daily;{nl}"
        f"{nl}"
        f"--- CRITICAL RULES ---{nl}"
        f"1. NO HALLUCINATIONS: Do not use table names like 'hospital', 'beds', or 'rooms'. Use ONLY `synthetic_hospital_data`.{nl}"
        f"2. NO RAW MAX: Do not write `MAX(count)`. Count is a function, not a column. You must aggregate in a CTE first.{nl}"
        f"3. PREFER MACROS: If a specific statistical macro is available (e.g. PROBABILITY), use it instead of writing raw math.{nl}"
      )

      macros_doc = (
        f"{nl}AVAILABLE DUCKDB MACROS (Use these for statistical logic):{nl}"
        f"- PROBABILITY(condition) -> float: Returns percentage (0-100) where condition is true.{nl}"
        f"- IS_OUTLIER(val, mean, sd) -> bool: True if value is > 2 standard deviations from mean.{nl}"
        f"- IS_BOTTLENECK(adm, dis) -> bool: True if admissions exceed discharges by >20%.{nl}"
        f"- SAFE_DIV(num, den) -> float: Division handling zero denominator.{nl}"
        f"- MOVING_AVERAGE(val, sort_col) -> float: 7-day simple moving average.{nl}"
        f"- HOLIDAY_DIFF(date_col, m, d) -> int: Days elapsed since specific month/day.{nl}"
        f"- IS_WEEKEND(date_col) -> bool: True if Sat/Sun.{nl}"
        f"- WEEKEND_LAG(date_col) -> bool: True if Fri/Sat (predicting lag).{nl}"
        f"- Z_SCORE(val, mu, sigma) -> float: Standard score calculation.{nl}"
        f"- CORRELATION_MATRIX(x, y) -> float: Pearson correlation.{nl}"
        f"- CONSECUTIVE_OVERLOAD(v1, v2, v3, cap) -> bool: True if 3 consecutive values > cap.{nl}"
        f"- SHIFT_CHANGE(dt, start_hr, end_hr) -> bool: True if timestamp hour is within range.{nl}"
        f"- GENERATE_DATES(start, end) -> TABLE: Date spine for LEFT JOINs.{nl}"
      )

      functions_doc = (
        f"{nl}AVAILABLE ANALYTIC EXTENSIONS (User Defined Functions):{nl}"
        f"1. OPTIMIZE_ASSIGNMENTS(demand_json, capacity_json, affinity_json, constraints_json) -> JSON String{nl}"
        f"   - Description: Solves linear programming optimization for patient placement.{nl}"
        f"   - Arguments:{nl}"
        "       - demand_json (VARCHAR): JSON object mapping Service Name to Patient Count (e.g., '{\"Cardio\": 10}')."
        f"{nl}"
        "       - capacity_json (VARCHAR): JSON object mapping Unit Name to Bed Capacity (e.g., '{\"ICU\": 5}')."
        f"{nl}"
        '       - affinity_json (VARCHAR): JSON object mapping Service->Unit->Score (e.g., \'{"Cardio": {"ICU": 1.0}}\').'
        f"{nl}"
        '       - constraints_json (VARCHAR): JSON list of hard rules (e.g., \'[{"type": "force_flow", "service": "Gen_Peds", "unit": "PCU_A", "min": 5}]\').'
        f"{nl}"
        f"   - Output: A JSON String representing a list of assignment objects.{nl}"
        f"   - Usage Pattern (DuckDB): {nl}"
        "     Use `unnest(from_json(OPTIMIZE_ASSIGNMENTS(...), '[\"json\"]'))` to convert the result back into rows."
        f"{nl}"
      )

      examples_doc = (
        f"{nl}EXAMPLE QUERIES:{nl}"
        f"1. Calculate Utilization Probability:{nl}"
        f"   SELECT PROBABILITY(cnt > 20) FROM (SELECT CAST(Midnight_Census_DateTime AS DATE), COUNT(*) as cnt FROM synthetic_hospital_data GROUP BY 1);{nl}"
        f"{nl}"
        f"2. Identify Bottlenecks:{nl}"
        f"   SELECT Clinical_Service FROM synthetic_hospital_data GROUP BY 1 HAVING IS_BOTTLENECK(SUM(1), SUM(1));{nl}"
      )

      return Ok(nl.join(schema_lines) + domain_logic + macros_doc + functions_doc + examples_doc)

    except (duckdb.Error, RuntimeError, ValueError, TypeError, OSError) as e:
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

  def get_schema_context_string(self, conn: DuckDBConnectionProtocol | None = None) -> str:
    """
    Generates a condensed text representation of the database schema and available
    analytical extensions (UDFs) specifically formatted for LLM System Prompts.

    Args:
        conn (DuckDBConnectionProtocol | None): Optional pre-opened DuckDB connection.

    Returns:
        str: The formatted schema context string.
    """
    res = self.get_schema_context_result(conn=conn)
    if isinstance(res, Ok):
      return res.value
    return res.error.message

  async def get_schema_context_string_async(self, conn: DuckDBConnectionProtocol | None = None) -> str:
    """
    Asynchronously generates the schema context string in a background worker thread.

    Args:
        conn (DuckDBConnectionProtocol | None): Optional pre-opened DuckDB connection.

    Returns:
        str: Formatted schema context string.
    """
    return await asyncio.to_thread(self.get_schema_context_string, conn)

  def get_schema_json(self, conn: DuckDBConnectionProtocol | None = None) -> list[TableSchemaDict]:
    """
    Returns structured JSON representation of the database schema.
    Useful for the Frontend SQL Builder UI to display available columns.

    Args:
        conn (DuckDBConnectionProtocol | None): Optional pre-opened DuckDB connection.

    Returns:
        list[TableSchemaDict]: List of table objects containing name and columns.
    """
    owns_conn = conn is None
    active_conn: DuckDBConnectionProtocol = conn if conn is not None else self.manager.get_readonly_connection()
    try:
      tables_list: list[TableSchemaDict] = []
      tables = active_conn.execute("SHOW TABLES").fetchall()

      for (table_name,) in tables:
        t_str = str(table_name)
        safe_table = t_str.replace('"', '""')
        cols_data: list[ColumnSchemaDict] = []
        columns = active_conn.execute(f'DESCRIBE "{safe_table}"').fetchall()

        for col in columns:
          cols_data.append({"name": str(col[0]), "type": str(col[1])})

        tables_list.append({"table_name": t_str, "columns": cols_data})
      return tables_list
    finally:
      if owns_conn:
        active_conn.close()

  async def get_schema_json_async(self, conn: DuckDBConnectionProtocol | None = None) -> list[TableSchemaDict]:
    """
    Asynchronously retrieves structured schema metadata in a background worker thread.

    Args:
        conn (DuckDBConnectionProtocol | None): Optional pre-opened DuckDB connection.

    Returns:
        list[TableSchemaDict]: List of table metadata dictionaries.
    """
    return await asyncio.to_thread(self.get_schema_json, conn)


# Singleton instance
schema_service = SchemaService()
