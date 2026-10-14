"""
Tests for prompt strategy base class coverage.
"""

from typing import Any

from app.services.prompt_engineering.interfaces import PromptStrategy


class _DummyStrategy(PromptStrategy):
  def get_strategy_name(self) -> str:
    """Verify get strategy name behavior."""
    return PromptStrategy.get_strategy_name(self)

  def build_messages(self, user_query: str, schema_context: str) -> Any:
    """
    Verify build messages behavior.

    Args:
        user_query: Test parameter or fixture.
        schema_context: Test parameter or fixture.
    """
    return PromptStrategy.build_messages(self, user_query, schema_context)


def test_prompt_strategy_base_methods_are_callable() -> None:
  """Exercise abstract base method bodies for coverage."""
  dummy = _DummyStrategy()
  assert dummy.get_strategy_name() is None
  assert dummy.build_messages("q", "schema") is None
