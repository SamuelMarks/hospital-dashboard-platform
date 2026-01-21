"""
Tests for Prompt Engineering - Zero Shot Strategy.

Verifies that the strategy correctly implements the Interface and produces
prompts compliant with the "Baseline" requirements (No examples, strict rules).
"""

import pytest
from app.services.prompt_engineering.zero_shot import ZeroShotStrategy
from app.services.prompt_engineering.interfaces import PromptStrategy


def test_zero_shot_strategy_inheritance() -> None:
  """
  Verify that ZeroShotStrategy correctly implements the PromptStrategy abstract base class.
  """
  strategy = ZeroShotStrategy()
  assert isinstance(strategy, PromptStrategy)
  assert strategy.get_strategy_name() == "zero-shot"


def test_build_messages_structure() -> None:
  """
  Verify the message list structure matches OpenAI/AnyLLM requirements.
  """
  strategy = ZeroShotStrategy()
  schema = "Table: patients (id INT)"
  query = "Count patients"

  messages = strategy.build_messages(query, schema)

  assert isinstance(messages, list)
  assert len(messages) == 2

  # Check System Message
  assert messages[0]["role"] == "system"
  assert "expert data analyst" in messages[0]["content"].lower()
  assert "duckdb" in messages[0]["content"].lower()

  # Check User Message
  assert messages[1]["role"] == "user"
  assert "Here is the database schema" in messages[1]["content"]
  assert "Question: Count patients" in messages[1]["content"]


def test_build_messages_context_injection() -> None:
  """
  Verify that the schema context and user query are accurately injected
  into the final string payload.
  """
  strategy = ZeroShotStrategy()
  mock_schema = "CREATE TABLE test_table (id INT, val VARCHAR);"
  mock_query = "Select all values where id > 5"

  messages = strategy.build_messages(mock_query, mock_schema)
  user_content = messages[1]["content"]

  assert mock_schema in user_content
  assert mock_query in user_content


def test_system_constraints() -> None:
  """
  Verify strictly that the system prompt contains the critical negative constraints
  required for the baseline control group.
  """
  strategy = ZeroShotStrategy()
  # Access internal method for direct inspection during unit test
  sys_prompt = strategy._compose_system_instruction()

  assert "ONLY the raw SQL" in sys_prompt
  assert "Do not wrap in markdown" in sys_prompt
  assert "DuckDB" in sys_prompt
