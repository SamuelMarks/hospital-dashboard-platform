"""
SQL Generator Service.

This module orchestrates the Text-to-SQL functionality and Parameter Injection.
It combines the database schema context with a specialized System Prompt.

**Update:** Added logic to inject Global Dashboard Filters (Service, Date Range)
into raw queries before execution or prompt generation.
"""

import re
from typing import Dict, Any
from app.services.llm_client import llm_client
from app.services.schema import schema_service


class SQLGeneratorService:
  """
  Service responsible for converting natural language questions into executable SQL
  and managing parameter substitution.
  """

  def __init__(self) -> None:
    """Initialize the generator with LLM client and Schema service."""
    self.llm = llm_client
    self.schema_svc = schema_service

  def _clean_sql_response(self, raw_response: str) -> str:
    """
    Sanitizes LLM output to extract pure SQL.

    Args:
        raw_response (str): The potentially Markdown-formatted string from LLM.

    Returns:
        str: Clean SQL string.
    """
    cleaned = raw_response.strip()
    pattern = r"```(?:sql)?(.*?)```"
    match = re.search(pattern, cleaned, re.DOTALL)
    if match:
      cleaned = match.group(1).strip()
    return cleaned

  def process_global_filters(self, sql: str, global_params: Dict[str, Any]) -> str:
    """
    Injects global dashboard filter values into SQL placeholders.

    Supported Globals:
    - {{global_service}}: Replaces with "AND Clinical_Service = 'Value'" logic or direct value.
    - {{global_date_range}}: Replaces with date predicate.
    - {{global_start_date}}: Replaces with raw start date value (YYYY-MM-DD).
    - {{global_end_date}}: Replaces with raw end date value (YYYY-MM-DD).

    Args:
        sql (str): The raw SQL query.
        global_params (Dict): Dictionary of active filters (e.g. {'dept': 'Cardiology'}).

    Returns:
        str: The SQL with injected filters.
    """
    processed_sql = sql

    # 1. Service Filter
    # Usage in SQL: "WHERE ... {{global_service}}"
    # If param exists: "AND Clinical_Service = 'Cardiology'"
    # If param missing: "" (Empty string effectively ignores it)
    service_val = global_params.get("dept")  # Mapped from frontend 'dept'
    if "{{global_service}}" in processed_sql:
      injection = f"AND Clinical_Service = '{service_val}'" if service_val else ""
      processed_sql = processed_sql.replace("{{global_service}}", injection)

    # 2. Date Variables
    # Extract date values if present
    start_date = global_params.get("start_date")
    end_date = global_params.get("end_date")

    # 2a. Range Predicate Injection
    # Usage: "WHERE ... {{global_date_range}}"
    # Logic: "AND Midnight_Census_DateTime BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'"
    if "{{global_date_range}}" in processed_sql:
      if start_date and end_date:
        # DuckDB is flexible with date strings, assuming frontend sends ISO YYYY-MM-DD
        injection = f"AND Midnight_Census_DateTime BETWEEN '{start_date}' AND '{end_date}'"
      else:
        injection = ""

      processed_sql = processed_sql.replace("{{global_date_range}}", injection)

    # 2b. Raw Date Value Injection (For GENERATE_DATES macro)
    # Usage: "FROM GENERATE_DATES('{{global_start_date}}', '{{global_end_date}}')"
    if "{{global_start_date}}" in processed_sql:
      # Fallback to a reasonable default if missing to prevent SQL errors (e.g. 30 days ago)
      val = start_date if start_date else "2023-01-01"
      processed_sql = processed_sql.replace("{{global_start_date}}", val)

    if "{{global_end_date}}" in processed_sql:
      # Fallback to today/future if missing
      val = end_date if end_date else "2023-12-31"
      processed_sql = processed_sql.replace("{{global_end_date}}", val)

    return processed_sql

  async def generate_sql(self, user_query: str) -> str:
    """
    Orchestrates the Text-to-SQL generation flow.

    Args:
        user_query (str): The natural language question from the user.

    Returns:
        str: Executable SQL query.
    """
    schema_context = self.schema_svc.get_schema_context_string()

    system_instructions = (
      "You are an expert data analyst using DuckDB. "
      "Your task is to convert the user's natural language question into a valid SQL query based strictly on the provided schema.\n"
      "Rules:\n"
      "1. Output ONLY the SQL query. No explanations, no markdown intro.\n"
      "2. Use DuckDB syntax (Standard SQL compatible).\n"
      "3. Do not invent columns or tables not listed in the schema.\n"
      "4. For Optimization/Binding requests, use the `OPTIMIZE_ASSIGNMENTS` function.\n"
      "   - Use CTEs to aggregate data first.\n"
      "   - Use `to_json` or `json_object` to format inputs for the optimizer.\n"
      "   - Use `unnest(from_json(..., '[\"json\"]'))` to expand the result.\n"
      "5. For Time-Series Analysis (Trends, Forecasting):\n"
      "   - You MUST handle sparse data (missing dates) by generating a Date Spine.\n"
      "   - Use `GENERATE_DATES('start', 'end')` to create a spine.\n"
      "   - `LEFT JOIN` your data against the spine.\n"
      "   - Use `COALESCE(count, 0)` for empty days.\n"
      "   - Example: `WITH spine AS (SELECT * FROM GENERATE_DATES('2023-01-01', '2023-01-31')) ...`\n"
      "6. Use LIMIT 100 for broad SELECT queries unless specified otherwise."
    )

    messages = [
      {"role": "system", "content": system_instructions},
      {
        "role": "user",
        "content": f"Database Schema:\n{schema_context}\n\nQuestion: {user_query}\n\nSQL Query:",
      },
    ]

    raw_response = await self.llm.generate_response(messages=messages, temperature=0.1, max_tokens=600)
    return self._clean_sql_response(raw_response)


# Singleton instance
sql_generator = SQLGeneratorService()
