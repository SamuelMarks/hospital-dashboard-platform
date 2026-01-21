"""
Zero-Shot Prompt Strategy.

This module implements the Baseline Control Group for the benchmark.
It provides the LLM with the raw Database Schema and the User Question,
with no additional examples (Few-Shot) or reasoning steps (Chain-of-Thought).

It strictly enforces basic rules:
1. Use DuckDB Dialect.
2. Output SQL only.
3. No Hallucinations (stick to provided schema).
"""

from typing import List, Dict
from app.services.prompt_engineering.interfaces import PromptStrategy


class ZeroShotStrategy(PromptStrategy):
  """
  Implementation of the Zero-Shot prompting technique.
  Relying purely on the model's internal knowledge of SQL and the provided schema context.
  """

  def get_strategy_name(self) -> str:
    """
    Return the identifier for logging.

    Returns:
        str: "zero-shot"
    """
    return "zero-shot"

  def _compose_system_instruction(self) -> str:
    """
    Internal helper to build the System Prompt.

    Returns:
        str: The fixed system instruction block.
    """
    return (
      "You are an expert data analyst specializing in hospital analytics."
      "\nYour goal is to convert natural language questions into executable SQL queries."
      "\n"
      "\nCRITICAL RULES:"
      "\n1. Dialect: Use DuckDB SQL syntax (PostgreSQL compatible)."
      "\n2. Scope: Use ONLY the tables and columns defined in the context."
      "\n3. Safety: Do not write queries that modify data (INSERT/UPDATE/DROP)."
      "\n4. Output: Return ONLY the raw SQL code. Do not wrap in markdown. Do not provide explanations."
    )

  def build_messages(self, user_query: str, schema_context: str) -> List[Dict[str, str]]:
    """
    Constructs the zero-shot prompt payload.

    Args:
        user_query: The user's question.
        schema_context: The database tables/columns definitions.

    Returns:
        List[Dict[str, str]]: The formatted messages for the LLM API.
    """
    system_content = self._compose_system_instruction()

    # We inject the schema into the User Prompt to ensure it is "attended" to
    # most recently by the model, a common best practice for context adherence.
    user_content = f"Here is the database schema:\n=====\n{schema_context}\n=====\n\nQuestion: {user_query}\n\nSQL Query:"

    return [
      {"role": "system", "content": system_content},
      {"role": "user", "content": user_content},
    ]
