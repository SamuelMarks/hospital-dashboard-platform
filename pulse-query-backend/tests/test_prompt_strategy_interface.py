"""
Behavioral contract tests for the `PromptStrategy` abstract interface and its concrete implementations.
"""

import pytest

from app.services.prompt_engineering.few_shot_rag import FewShotRAGStrategy
from app.services.prompt_engineering.interfaces import PromptStrategy
from app.services.prompt_engineering.macro_cot import MacroCoTStrategy
from app.services.prompt_engineering.zero_shot import ZeroShotStrategy


def test_prompt_strategy_cannot_be_instantiated_directly() -> None:
  """Verifies `PromptStrategy` and incomplete subclasses raise `TypeError` on instantiation."""

  class IncompleteStrategyMissingBuild(PromptStrategy):
    """Subclass implementing only `get_strategy_name`."""

    def get_strategy_name(self) -> str:
      """Returns dummy strategy name."""
      return "incomplete"

  class IncompleteStrategyMissingName(PromptStrategy):
    """Subclass implementing only `build_messages`."""

    def build_messages(self, user_query: str, schema_context: str) -> list[dict[str, str]]:
      """Returns dummy messages list."""
      return [{"role": "user", "content": f"{schema_context}: {user_query}"}]

  with pytest.raises(TypeError):
    IncompleteStrategyMissingBuild()  # type: ignore[abstract]

  with pytest.raises(TypeError):
    IncompleteStrategyMissingName()  # type: ignore[abstract]


def test_concrete_prompt_strategies_fulfill_contract() -> None:
  """Verifies all concrete `PromptStrategy` subclasses inject schema context, user query, and unique strategy names."""
  strategies: list[PromptStrategy] = [
    ZeroShotStrategy(),
    MacroCoTStrategy(),
    FewShotRAGStrategy(),
  ]
  seen_names: set[str] = set()
  schema_marker = "Table: synthetic_hospital_data (Clinical_Service VARCHAR, Location VARCHAR)"
  question_marker = "How many ICU beds are occupied?"

  for strategy in strategies:
    assert isinstance(strategy, PromptStrategy)
    name = strategy.get_strategy_name()
    assert isinstance(name, str)
    assert len(name) > 0
    seen_names.add(name)

    msgs = strategy.build_messages(question_marker, schema_marker)
    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"
    combined_prompt = f"{msgs[0]['content']}\n{msgs[1]['content']}"
    assert schema_marker in combined_prompt
    assert question_marker in msgs[1]["content"]

  assert seen_names == {"zero-shot", "cot-macro", "rag-few-shot"}
