"""
Behavioral contract tests for the `PromptStrategy` abstract interface and its concrete implementations.
"""

import pytest

from app.services.prompt_engineering.few_shot_rag import FewShotRAGStrategy
from app.services.prompt_engineering.interfaces import PromptStrategy
from app.services.prompt_engineering.macro_cot import MacroCoTStrategy
from app.services.prompt_engineering.zero_shot import ZeroShotStrategy


def test_prompt_strategy_cannot_be_instantiated_directly() -> None:
  """Verifies `PromptStrategy` is an abstract base class that raises `TypeError` on direct instantiation."""
  with pytest.raises(TypeError):
    PromptStrategy()  # type: ignore[abstract]


def test_concrete_prompt_strategies_fulfill_contract() -> None:
  """Verifies all concrete `PromptStrategy` subclasses return non-empty tags and valid `[system, user]` messages."""
  strategies: list[PromptStrategy] = [
    ZeroShotStrategy(),
    MacroCoTStrategy(),
    FewShotRAGStrategy(),
  ]
  for strategy in strategies:
    assert isinstance(strategy, PromptStrategy)
    name = strategy.get_strategy_name()
    assert isinstance(name, str)
    assert len(name) > 0

    msgs = strategy.build_messages("How many ICU beds are occupied?", "Table: synthetic_hospital_data")
    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"
    assert "How many ICU beds are occupied?" in msgs[1]["content"]
