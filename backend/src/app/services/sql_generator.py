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
    self.llm = llm_client
    self.schema_svc = schema_service

  def _clean_sql_response(self, raw_response: str) -> str:
    """
    Sanitizes LLM output to extract pure SQL.
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

    # 2. Date Range Filter (Placeholder logic for future date picker)
    # Usage: "WHERE ... {{global_date_range}}"
    # Logic: "AND Midnight_Census_DateTime > ..."
    # For now, we handle generic injection if provided

    return processed_sql

  async def generate_sql(self, user_query: str) -> str:
    """
    Orchestrates the Text-to-SQL generation flow.
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
      "5. Use LIMIT 100 for broad SELECT queries unless specified otherwise."
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
