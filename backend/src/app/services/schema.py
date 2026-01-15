"""
Database Schema Service.

This module is responsible for extracting metadata (tables, columns, types) from the
internal DuckDB instance. It formats this metadata into context strings that enable
the AI/LLM to generate syntactically correct SQL queries corresponding to the
actual data structure.
"""

import duckdb
from typing import List, Dict, Any
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

  def get_schema_context_string(self) -> str:
    """
    Generates a condensed text representation of the database schema and available
    analytical extensions (UDFs) specifically formatted for LLM System Prompts.

    Format:
    Table: table_name
    - column_name (TYPE)
    ...

    Extensions:
    ...

    Returns:
        str: The formatted schema context string.
    """
    conn = self.manager.get_connection()
    try:
      # 1. Get all tables
      tables = conn.execute("SHOW TABLES").fetchall()
      schema_lines: List[str] = []

      if not tables:
        schema_lines.append("No tables found in the database.")
      else:
        for (table_name,) in tables:
          schema_lines.append(f"Table: {table_name}")

          # 2. Get columns for this table
          # DESCRIBE returns: column_name, column_type, null, key, default, extra
          columns = conn.execute(f"DESCRIBE {table_name}").fetchall()

          for col in columns:
            col_name = col[0]
            col_type = col[1]
            schema_lines.append(f"- {col_name} ({col_type})")

          schema_lines.append("")  # Empty line between tables

      # 3. Append Documentation for Optimization UDFs
      # This teaches the LLM how to use the MPAX bridge.
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
        "     Example:\n"
        "     SELECT unnest(from_json(OPTIMIZE_ASSIGNMENTS('{\"A\":1}', '{\"B\":1}', '{}', '[]'), '[\"json\"]'));\n"
      )

      return "\n".join(schema_lines) + functions_doc

    except Exception as e:
      return f"Error retrieving schema: {str(e)}"
    finally:
      conn.close()

  def get_schema_json(self) -> List[Dict[str, Any]]:
    """
    Returns structured JSON representation of the database schema.
    Useful for the Frontend SQL Builder UI to display available columns.

    Returns:
        List[Dict[str, Any]]: List of table objects containing name and columns.
    """
    conn = self.manager.get_connection()
    try:
      tables_list: List[Dict[str, Any]] = []
      tables = conn.execute("SHOW TABLES").fetchall()

      for (table_name,) in tables:
        cols_data: List[Dict[str, str]] = []
        columns = conn.execute(f"DESCRIBE {table_name}").fetchall()

        for col in columns:
          cols_data.append({"name": col[0], "type": col[1]})

        tables_list.append({"table_name": table_name, "columns": cols_data})
      return tables_list
    finally:
      conn.close()


# Singleton instance
schema_service = SchemaService()
