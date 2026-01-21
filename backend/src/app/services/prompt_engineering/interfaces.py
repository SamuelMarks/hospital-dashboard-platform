"""
Prompt Engineering Interfaces.

This module defines the abstract contract that all Prompt Strategies must adhere to.
This polymorphism allows the `SQLGeneratorService` to swap between "Zero-Shot",
"Chain-of-Thought", and "RAG" strategies dynamically during benchmarking without
altering the execution logic.
"""

from abc import ABC, abstractmethod
from typing import List, Dict


class PromptStrategy(ABC):
  """
  Abstract Base Class for SQL Generation Strategies.

  A Prompt Strategy encapsulates the logic for converting a User's Natural Language
  Question and the Database Schema into a structured list of messages acceptable
  by an LLM (OpenAI-compatible format).
  """

  @abstractmethod
  def get_strategy_name(self) -> str:
    """
    Returns the unique identifier for this strategy.
    Used for logging usage in the `experiment_logs` table.

    Returns:
        str: The strategy tag (e.g., "zero-shot", "cot-macro").
    """
    pass

  @abstractmethod
  def build_messages(self, user_query: str, schema_context: str) -> List[Dict[str, str]]:
    """
    Constructs the full message payload for the LLM.

    This usually involves:
    1. constructing a System Prompt containing role definitions and constraints.
    2. constructing a User Message containing the specific question and schema.

    Args:
        user_query: The natural language question asked by the user.
        schema_context: The text representation of the database DDL/Schema.

    Returns:
        List[Dict[str, str]]: A list of message objects, e.g.:
        [
            {"role": "system", "content": "..."},
            {"role": "user", "content": "..."}
        ]
    """
    pass
