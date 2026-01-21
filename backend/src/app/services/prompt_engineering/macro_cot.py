"""
Macro Chain-of-Thought (CoT) Prompt Strategy.

This module implements "Strategy B" for the benchmarking arena.
Unlike the Zero-Shot strategy which relies on the LLM's internal math capabilities,
this strategy forces the model to use pre-defined, tested SQL Macros (UDFs) for
statistical analysis.

It leverages the "Chain of Thought" prompting technique ("Let's think step by step")
to improve reasoning regarding Clinical Service matching and Temporal Window logic
before writing the final SQL.
"""

from typing import List, Dict, Optional
from app.services.prompt_engineering.interfaces import PromptStrategy


class MacroCoTStrategy(PromptStrategy):
  """
  Implementation of the Chain-of-Thought prompting technique augmented with
  Domain-Specific SQL Macros.

  This strategy injects a "Standard Library" of hospital analytics functions
  into the context and instructs the model to prefer these over raw arithmetic.
  """

  # Define the reference documentation for the macros available in duckdb_init.py
  # In a production scenario, this could be dynamically extracted via reflection,
  # but hardcoded documentation ensures consistency across benchmark runs.
  MACRO_LIBRARY_DOCS = (
    "AVAILABLE ANALYTIC MACROS (Use these instead of raw math):\n"
    "- PROBABILITY(condition) -> float: Calculates percentage likelihood (0-100) of a condition being true.\n"
    "- IS_OUTLIER(val, mean, sd) -> bool: Returns TRUE if val is > 2 standard deviations from mean.\n"
    "- IS_BOTTLENECK(admits, discharges) -> bool: Returns TRUE if admissions exceed discharges significantly (>20%).\n"
    "- SAFE_DIV(num, den) -> float: Performs division handling divide-by-zero (returns 0).\n"
    "- MOVING_AVERAGE(val, sort_col) -> float: Calculates 7-day trailing simple moving average.\n"
    "- HOLIDAY_DIFF(date_col, m, d) -> int: Returns days elapsed since specific Month/Day.\n"
    "- IS_WEEKEND(date_col) -> bool: Returns TRUE if Saturday or Sunday.\n"
    "- WEEKEND_LAG(date_col) -> bool: Returns TRUE if Friday or Saturday (predicting weekend discharge lag).\n"
    "- Z_SCORE(val, mean, sd) -> float: Calculates standard score.\n"
    "- CORRELATION_MATRIX(x, y) -> float: Returns Pearson correlation coefficient.\n"
    "- SHIFT_CHANGE(timestamp, start_hr, end_hr) -> bool: Returns TRUE if time falls within shift change window.\n"
    "- CONSECUTIVE_OVERLOAD(v1, v2, v3, cap) -> bool: Returns TRUE if three consecutive values exceed capacity.\n"
    "- GENERATE_DATES(start, end) -> TABLE: Generates a date spine for filling sparse data gaps.\n"
  )

  def get_strategy_name(self) -> str:
    """
    Returns the unique identifier for logging purposes.

    Returns:
        str: "cot-macro"
    """
    return "cot-macro"

  def _compose_system_instruction(self) -> str:
    """
    Constructs the System Prompt.

    The prompt differs from Zero-Shot by:
    1. Defining the Persona as a "Clinical Data Scientist".
    2. Explicitly listing the Macros.
    3. Enforcing a "Reasoning First" output structure.

    Returns:
        str: The full system instruction block.
    """
    return (
      "You are a Clinical Data Scientist. Your job is to answer hospital operational questions using DuckDB SQL."
      "\n"
      "\nGUIDELINES:"
      "\n1. USE MACROS: Do not write complex arithmetic manually (e.g. standard deviation, z-scores). "
      "Use the provided Domain Macros instead."
      "\n2. THINK STEP-BY-STEP: Before writing SQL, break down the logic: "
      "Identify the Unit, Identify the Time Window, Choose the Statistical Test."
      "\n3. HANDLE SPARSITY: If asking for time-series trends, always LEFT JOIN against `GENERATE_DATES` macro."
      "\n4. OUTPUT FORMAT: Return valid SQL only."
      f"\n\n{self.MACRO_LIBRARY_DOCS}"
    )

  def build_messages(
    self, user_query: str, schema_context: str, additional_context: Optional[str] = None
  ) -> List[Dict[str, str]]:
    """
    Constructs the Chain-of-Thought prompt payload.

    Args:
        user_query: The user's natural language request.
        schema_context: The DDL definitions of the database.
        additional_context: Optional extra info (unused in this strategy but required by signature compatibility).

    Returns:
        List[Dict[str, str]]: The formatted messages for the LLM.
    """
    system_content = self._compose_system_instruction()

    user_content = (
      f"Schema Context:\n{schema_context}\n\n"
      f"User Question: {user_query}\n\n"
      "Let's think step by step to select the right Macros and Tables, then generate the SQL:"
    )

    return [
      {"role": "system", "content": system_content},
      {"role": "user", "content": user_content},
    ]
