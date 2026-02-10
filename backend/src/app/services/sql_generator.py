"""
SQL Generator Service (Arena Orchestrator).

This module orchestrates the Text-to-SQL generation flow.
It acts as the central hub connecting:
1. The Schema Service (Context Provider).
2. The Prompt Engineering Strategies (Context Formatting).
3. The LLM Client (Inference Execution).
4. The Database (Evaluation & Logging).

Refactor Update:
Now supports dynamic switching between specific Prompt Strategies (Zero-Shot, CoT, RAG)
allowing for scientific benchmarking of different engineering techniques.
"""

import re
import logging
from typing import Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm_client import llm_client, ArenaResponse
from app.services.schema import schema_service
from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.user import User
from app.schemas.feedback import ExperimentResponse

# Prompt Strategies
from app.services.prompt_engineering.interfaces import PromptStrategy
from app.services.prompt_engineering.zero_shot import ZeroShotStrategy
from app.services.prompt_engineering.macro_cot import MacroCoTStrategy
from app.services.prompt_engineering.few_shot_rag import FewShotRAGStrategy

logger = logging.getLogger(__name__)


class SQLGeneratorService:
  """
  Service responsible for converting natural language questions into executable SQL
  using a multi-model, multi-strategy approach.
  """

  def __init__(self) -> None:
    """
    Initialize the generator with the Arena client and Schema service.
    Strategies are instantiated lazily or on-demand to allow stateful configuration.
    """
    self.llm = llm_client
    self.schema_svc = schema_service

  def _get_strategy_implementation(self, strategy_tag: str) -> PromptStrategy:
    """
    Factory method to resolve the strategy string identifier to a concrete class.

    Args:
        strategy_tag (str): The identifier (e.g., "zero-shot", "cot-macro", "rag-few-shot").

    Returns:
        PromptStrategy: The instantiated strategy object.
        Defaults to ZeroShotStrategy if tag is unrecognized.
    """
    tag = strategy_tag.lower() if strategy_tag else "zero-shot"

    if tag == "cot-macro":
      return MacroCoTStrategy()
    elif tag == "rag-few-shot":
      return FewShotRAGStrategy()
    # Default fallback
    return ZeroShotStrategy()

  def _clean_sql_response(self, raw_response: str) -> str:
    """
    Sanitizes LLM output to extract pure SQL.
    Handles variations in Markdown quoting (```sql ... ```).

    Args:
        raw_response (str): The raw text output from the LLM.

    Returns:
        str: The clean SQL query string.
    """
    cleaned = raw_response.strip()
    pattern = r"```(?:sql)?(.*?)```"
    match = re.search(pattern, cleaned, re.DOTALL)
    if match:
      cleaned = match.group(1).strip()
    return cleaned

  def process_global_filters(self, sql: str, global_params: Dict[str, Any]) -> str:
    """
    Injects global dashboard filter values into SQL placeholders.
    Allows a single query to be reused across different departments/dates.

    Args:
        sql (str): The SQL template containing {{handlebars}}.
        global_params (Dict): User selection (e.g., { "dept": "Cardiology" }).

    Returns:
        str: The executable SQL with values injected.
    """
    processed_sql = sql
    service_val = global_params.get("dept")

    if "{{global_service}}" in processed_sql:
      injection = f"AND Clinical_Service = '{service_val}'" if service_val else ""
      processed_sql = processed_sql.replace("{{global_service}}", injection)

    start_date = global_params.get("start_date")
    end_date = global_params.get("end_date")

    if "{{global_date_range}}" in processed_sql:
      if start_date and end_date:
        injection = f"AND Midnight_Census_DateTime BETWEEN '{start_date}' AND '{end_date}'"
      else:
        injection = ""
      processed_sql = processed_sql.replace("{{global_date_range}}", injection)

    if "{{global_start_date}}" in processed_sql:
      val = start_date if start_date else "2023-01-01"
      processed_sql = processed_sql.replace("{{global_start_date}}", val)

    if "{{global_end_date}}" in processed_sql:
      val = end_date if end_date else "2023-12-31"
      processed_sql = processed_sql.replace("{{global_end_date}}", val)

    return processed_sql

  async def run_arena_experiment(
    self,
    user_query: str,
    db: AsyncSession,
    user: User,
    strategy: str = "zero-shot",
    dry_run: bool = False,
  ) -> ExperimentResponse:
    """
    Orchestrates the Text-to-SQL functionality.

    Steps:
    1. Resolve the Prompt Strategy.
    2. Retrieve Schema Context.
    3. Build Messages using Strategy logic (RAG retrieval, Macro injection, etc.).
    4. Broadcast to Arena (Parallel LLM Calls).
    5. Log Experiment and Candidates to DB.

    Args:
        user_query (str): The natural language question.
        db (AsyncSession): Database session for logging.
        user (User): Authenticated user.
        strategy (str): The prompt engineering technique to use.
        dry_run (bool): If True, skips LLM call and returns mock (for testing).

    Returns:
        ExperimentResponse: API Model containing candidates.
    """
    # 1. Strategy Resolution
    strategy_impl = self._get_strategy_implementation(strategy)
    actual_strategy_name = strategy_impl.get_strategy_name()

    # 2. Context Retrieval
    schema_context = self.schema_svc.get_schema_context_string()

    # 3. Message Construction (Polymorphic call)
    messages = strategy_impl.build_messages(user_query, schema_context)

    # 4. Broadcast to Arena
    if dry_run:
      logger.info("Dry Run Mode: Skipping LLM Broadcast")
      results = [ArenaResponse("MockModel", "mock/v1", f"SELECT 1; -- {actual_strategy_name}", 10, None)]
    else:
      logger.info(f"Broadcast [{actual_strategy_name}]: '{user_query[:30]}...' to {len(self.llm.swarm)} models.")
      # We set temperature low for SQL generation consistency
      results: List[ArenaResponse] = await self.llm.generate_arena_competition(
        messages=messages, temperature=0.1, max_tokens=600
      )

    # 5. Persistence
    # Create Experiment Log
    experiment = ExperimentLog(user_id=user.id, prompt_text=user_query, prompt_strategy=actual_strategy_name)
    db.add(experiment)
    await db.flush()  # Generate ID

    # Create Candidates
    for res in results:
      is_success = res.error is None and len(res.content) > 0
      final_sql = self._clean_sql_response(res.content) if is_success else ""
      error_msg = res.error if res.error else ("Empty Response" if not is_success else None)

      candidate = ModelCandidate(
        experiment_id=experiment.id,
        model_identifier=res.model_identifier,
        model_tag=res.provider_name,
        generated_sql=final_sql,
        latency_ms=res.latency_ms,
        is_selected=False,
        execution_success=None,
        error_message=error_msg,
      )
      db.add(candidate)

    await db.commit()
    await db.refresh(experiment)

    return ExperimentResponse.model_validate(experiment)


# Singleton instance
sql_generator = SQLGeneratorService()
