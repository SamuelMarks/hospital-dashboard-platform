"""
Tests for Prompt Engineering - Template RAG Strategy.

Verifies:
1. The Jaccard Similarity logic in the TemplateRetriever.
2. The dynamic injection of matching examples into the final prompt.
3. Fallback behavior when no matches are found.
"""

import pytest
from typing import List, Dict, Any
from unittest.mock import mock_open, patch
import builtins
import app.services.prompt_engineering.few_shot_rag as rag_module
from app.services.prompt_engineering.few_shot_rag import TemplateRetriever, FewShotRAGStrategy

# Mock Data for deterministic testing
MOCK_TEMPLATES: List[Dict[str, Any]] = [
  {
    "title": "Predictive Availability",
    "description": "Calculate probability of bed availability on Sunday",
    "category": "Availability",
    "sql_template": "SELECT probability...",
  },
  {
    "title": "Bottleneck Analysis",
    "description": "Identify flow congestion hours",
    "category": "Flow",
    "sql_template": "SELECT bottleneck...",
  },
]


@pytest.fixture
def mock_retriever() -> TemplateRetriever:
  """Fixture to provide a retriever loaded with mock templates."""
  return TemplateRetriever(templates_source=MOCK_TEMPLATES)


def test_tokenizer_logic(mock_retriever: TemplateRetriever) -> None:
  """Verify tokenizer removes punctuation and stop words."""
  text = "The quick brown Fox, jumps!"
  tokens = mock_retriever._tokenize(text)
  expected = {"quick", "brown", "fox", "jumps"}
  assert tokens == expected


def test_jaccard_similarity_calculation(mock_retriever: TemplateRetriever) -> None:
  """Verify calculation of Jaccard index."""
  set_a = {"a", "b", "c"}
  set_b = {"a", "c", "d"}
  score = mock_retriever._calculate_jaccard_similarity(set_a, set_b)
  assert score == 0.5


def test_retriever_finds_relevant_matches(mock_retriever: TemplateRetriever) -> None:
  """Verify searching."""
  query = "bed availability"
  results = mock_retriever.find_relevant_examples(query, limit=1)
  assert len(results) == 1
  assert results[0]["sql"] == "SELECT probability..."


def test_strategy_build_messages_with_examples(mock_retriever: TemplateRetriever) -> None:
  """
  Verify the Strategy correctly formats the found examples into the prompt.
  NOTE: We match a term that exists in the MOCK_TEMPLATES description ('congestion').
  """
  strategy = FewShotRAGStrategy(retriever=mock_retriever)

  # Use specific keyword 'congestion' which is in the mock description
  # This guarantees a Jaccard score > 0
  query = "Show me congestion issues"
  schema = "CREATE TABLE t1..."

  messages = strategy.build_messages(query, schema)
  user_content = messages[1]["content"]

  # Should contain the "Bottleneck Analysis" example found via 'congestion' match
  assert "--- Example 1 ---" in user_content
  assert "Identify flow congestion" in user_content
  # Should contain the generic instruction
  assert "Here are valid SQL examples" in user_content


def test_strategy_fallback_no_matches() -> None:
  """Verify behavior when no matches found."""
  empty_retriever = TemplateRetriever(templates_source=[])
  strategy = FewShotRAGStrategy(retriever=empty_retriever)

  messages = strategy.build_messages("Alien invasion stats", "Schema...")
  user_content = messages[1]["content"]

  assert "No similar examples found" in user_content


def test_retriever_loads_empty_when_file_missing(monkeypatch) -> None:
  """Missing template file should yield empty list."""
  monkeypatch.setattr(rag_module.os.path, "exists", lambda *_: False)
  retriever = TemplateRetriever()
  assert retriever.templates == []


def test_retriever_loads_empty_on_json_error(monkeypatch) -> None:
  """JSON errors should be swallowed and return empty list."""
  monkeypatch.setattr(rag_module.os.path, "exists", lambda *_: True)
  monkeypatch.setattr(builtins, "open", mock_open(read_data="[]"))
  monkeypatch.setattr(rag_module.json, "load", lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("bad")))

  retriever = TemplateRetriever()
  assert retriever.templates == []


def test_jaccard_similarity_empty_tokens(mock_retriever: TemplateRetriever) -> None:
  """Empty token sets should return 0.0."""
  score = mock_retriever._calculate_jaccard_similarity(set(), {"a"})
  assert score == 0.0
