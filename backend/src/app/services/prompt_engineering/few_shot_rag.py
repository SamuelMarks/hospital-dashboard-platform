"""
Few-Shot RAG Prompt Strategy.

This module implements "Strategy C" for the benchmarking arena.
It utilizes a similarity search mechanism ("The Retriever") to find standard
analytics templates that semantically match the user's current question.

Instead of asking the LLM to write SQL from scratch (Zero-Shot), it provides
3 "Gold Standard" examples of similar questions and their verified SQL.
This approach leverages the model's ability to perform pattern matching and
analogy, significantly reducing syntax errors for complex queries.
"""

import json
import os
import re
from typing import List, Dict, Any, Set, Tuple
from app.services.prompt_engineering.interfaces import PromptStrategy

# Helper to locate the standard content pack
# Path relative to: backend/src/app/services/prompt_engineering/
current_dir = os.path.dirname(os.path.abspath(__file__))
DATA_FILE_PATH = os.path.abspath(os.path.join(current_dir, "../../../../data/initial_templates.json"))


class TemplateRetriever:
  """
  Lightweight semantic search engine for SQL Templates.

  It computes the Jaccard Similarity Coefficient between the user's query tokens
  and the tokens found in the Template's Title, Description, and Category.
  """

  def __init__(self, templates_source: List[Dict[str, Any]] | None = None) -> None:
    """
    Initialize the retriever.

    Args:
        templates_source: Optional list of template dictionaries to use.
                          If None, attempts to load from disk (initial_templates.json).
    """
    self.templates = templates_source if templates_source is not None else self._load_templates_from_disk()
    self._stop_words = {"the", "a", "an", "of", "in", "for", "to", "is", "what", "show", "me"}

  def _load_templates_from_disk(self) -> List[Dict[str, Any]]:
    """
    Loads the template registry from the JSON file system.

    Returns:
        List[Dict[str, Any]]: The list of template objects, or empty list on failure.
    """
    if not os.path.exists(DATA_FILE_PATH):
      return []
    try:
      with open(DATA_FILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)
    except Exception:
      return []

  def _tokenize(self, text: str) -> Set[str]:
    """
    Converts a string into a set of normalized keywords.
    Removes punctuation and common stop words.

    Args:
        text: The raw input string.

    Returns:
        Set[str]: Unique, lowercase tokens.
    """
    # Remove non-alphanumeric chars (keep spaces)
    clean = re.sub(r"[^a-zA-Z0-9\s]", "", text.lower())
    tokens = set(clean.split())
    return tokens - self._stop_words

  def _calculate_jaccard_similarity(self, query_tokens: Set[str], doc_tokens: Set[str]) -> float:
    """
    Computes the Jaccard Index between two sets.
    Formula: Intersection / Union.

    Args:
        query_tokens: Tokens from user request.
        doc_tokens: Tokens from template document.

    Returns:
        float: Score between 0.0 (No overlap) and 1.0 (Identical).
    """
    if not query_tokens or not doc_tokens:
      return 0.0
    intersection = len(query_tokens.intersection(doc_tokens))
    union = len(query_tokens.union(doc_tokens))
    return intersection / union

  def find_relevant_examples(self, user_query: str, limit: int = 3) -> List[Dict[str, str]]:
    """
    Retrieves the top N matching templates for a given question.

    Args:
        user_query: The natural language question.
        limit: Maximum matches to return.

    Returns:
        List[Dict[str, str]]: A list of simplified objects containing 'question' and 'sql'.
    """
    query_tokens = self._tokenize(user_query)
    scored_candidates: List[Tuple[float, Dict[str, Any]]] = []

    for t in self.templates:
      # Create a "Document" from Title, Desc, and Category for matching
      doc_text = f"{t.get('title', '')} {t.get('description', '')} {t.get('category', '')}"
      doc_tokens = self._tokenize(doc_text)

      score = self._calculate_jaccard_similarity(query_tokens, doc_tokens)
      if score > 0:
        scored_candidates.append((score, t))

    # Sort descending by score
    scored_candidates.sort(key=lambda x: x[0], reverse=True)

    results = []
    for _, tmpl in scored_candidates[:limit]:
      results.append(
        {"question": tmpl.get("description") or tmpl.get("title", "Unknown"), "sql": tmpl.get("sql_template", "")}
      )

    return results


class FewShotRAGStrategy(PromptStrategy):
  """
  Implementation of "Strategy C".
  Augments the prompt with dynamically retrieved "Few-Shot" examples from the
  template library based on the specific question asked.
  """

  def __init__(self, retriever: TemplateRetriever | None = None) -> None:
    """
    Initialize the strategy.

    Args:
        retriever: Optional dependency injection for testing.
                   If None, creates a default Internal TemplateRetriever.
    """
    self.retriever = retriever or TemplateRetriever()

  def get_strategy_name(self) -> str:
    """
    Return the identifier for logging.

    Returns:
        str: "rag-few-shot"
    """
    return "rag-few-shot"

  def _format_examples(self, examples: List[Dict[str, str]]) -> str:
    """
    Formats the retrieved examples into a string block.

    Args:
        examples: List of dictionaries with 'question' and 'sql'.

    Returns:
        str: Formatted string block.
    """
    if not examples:
      return "No similar examples found."

    blocks = []
    for i, ex in enumerate(examples, 1):
      # Clean up SQL (remove handlebars if we want to show pure structure,
      # or keep them if we want the LLM to learn parameterization).
      # We keep them here as it teaches the LLM how to write adaptable queries.
      block = f"--- Example {i} ---\nQuestion: {ex['question']}\nSQL:\n{ex['sql']}\n"
      blocks.append(block)
    return "\n".join(blocks)

  def build_messages(self, user_query: str, schema_context: str) -> List[Dict[str, str]]:
    """
    Constructs the Few-Shot prompt payload.

    Steps:
    1. Retrieve top 3 similar templates using the Retriever.
    2. Format them as learning examples.
    3. Inject them into the User prompt before the actual question.

    Args:
        user_query: The user's question.
        schema_context: Database DDL.

    Returns:
        List[Dict[str, str]]: The formatted messages.
    """
    # 1. Retrieve
    relevant_examples = self.retriever.find_relevant_examples(user_query, limit=3)
    examples_text = self._format_examples(relevant_examples)

    # 2. Build System Prompt (Standard Expert Persona)
    system_content = (
      "You are an expert DuckDB SQL Analyst. "
      "Use the provided similar examples to learn the correct table structures and logic patterns. "
      "Adapt these patterns to answer the new question."
    )

    # 3. Build User Prompt (Context + Examples + Task)
    user_content = (
      f"Database Schema:\n{schema_context}\n\n"
      f"Here are valid SQL examples for similar requests:\n"
      f"{examples_text}\n\n"
      f"Now answer this specific Question:\n"
      f"{user_query}\n\n"
      f"SQL Query:"
    )

    return [
      {"role": "system", "content": system_content},
      {"role": "user", "content": user_content},
    ]
