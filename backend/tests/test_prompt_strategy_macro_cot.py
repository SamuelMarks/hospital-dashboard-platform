"""
Tests for Prompt Engineering - Macro CoT Strategy.
"""

import pytest
from app.services.prompt_engineering.macro_cot import MacroCoTStrategy
from app.services.prompt_engineering.interfaces import PromptStrategy


def test_strategy_identification() -> None:
  """Verify the strategy identifier."""
  strategy = MacroCoTStrategy()
  assert strategy.get_strategy_name() == "cot-macro"


def test_macro_injection_in_system_prompt() -> None:
  """Verify system prompt contains documentation."""
  strategy = MacroCoTStrategy()
  sys_prompt = strategy._compose_system_instruction()

  assert "PROBABILITY" in sys_prompt
  assert "IS_BOTTLENECK" in sys_prompt
  assert "USE MACROS" in sys_prompt


def test_cot_trigger_phrase() -> None:
  """
  Verify the User Message includes the "Let's think step by step" trigger phrase.
  Fix: Use case-insensitive check properly or match original casing.
  """
  strategy = MacroCoTStrategy()
  messages = strategy.build_messages("Analyze bottleneck", "Schema...")

  user_msg = next(m["content"] for m in messages if m["role"] == "user")

  # The implementation uses: "Let's think step by step"
  # We verify exact phrase or lower case match
  assert "Let's think step by step" in user_msg
