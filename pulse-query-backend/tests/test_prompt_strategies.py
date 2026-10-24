"""
Integration Tests for Prompt Strategies against real database persistence.

Verifies that `SQLGeneratorService` correctly instantiates and utilizes different
`PromptStrategy` implementations (Zero-Shot, CoT, RAG) and persists `ExperimentLog`
records with the corresponding `prompt_strategy` tag.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import ExperimentLog
from app.models.user import User
from app.services.llm_client import ArenaResponse
from app.services.sql_generator import SQLGeneratorService


@pytest_asyncio.fixture
async def persisted_user(db_session: AsyncSession) -> User:
  """
  Creates and persists a real `User` in `db_session`.

  Args:
      db_session (AsyncSession): Active test database session.

  Returns:
      User: Persisted user entity.
  """
  u = User(email=f"strat_{uuid.uuid4()}@hospital.org", hashed_password="pw")
  db_session.add(u)
  await db_session.commit()
  await db_session.refresh(u)
  return u


@pytest.fixture
def orchestrator() -> SQLGeneratorService:
  """Returns an instance of `SQLGeneratorService` with deterministic schema context."""
  svc = SQLGeneratorService()
  svc.schema_svc = MagicMock()
  svc.schema_svc.get_schema_context_string.return_value = "CREATE TABLE t (id INT);"
  svc.llm = MagicMock()
  svc.llm.generate_arena_competition = AsyncMock(return_value=[])
  return svc


@pytest.mark.asyncio
async def test_run_arena_uses_zero_shot_messages(
  orchestrator: SQLGeneratorService,
  db_session: AsyncSession,
  persisted_user: User,
) -> None:
  """Verify 'zero-shot' strategy prompt construction and ExperimentLog persistence."""
  with patch.object(
    orchestrator.llm,
    "generate_arena_competition",
    new=AsyncMock(return_value=[ArenaResponse("Model A", "id-a", "SELECT 1", 100, None)]),
  ) as mock_gen:
    res = await orchestrator.run_arena_experiment("Count patients", db_session, persisted_user, strategy="zero-shot")

    call_args = mock_gen.call_args
    messages = call_args[1]["messages"]
    system_msg = messages[0]["content"]
    user_msg = messages[1]["content"]

    assert "expert data analyst" in system_msg.lower()
    assert "valid sql examples" not in user_msg.lower()

  exp = (await db_session.execute(select(ExperimentLog).where(ExperimentLog.id == res.id))).scalars().first()
  assert exp is not None
  assert exp.prompt_strategy == "zero-shot"


@pytest.mark.asyncio
async def test_run_arena_uses_rag_messages(
  orchestrator: SQLGeneratorService,
  db_session: AsyncSession,
  persisted_user: User,
) -> None:
  """Verify 'rag-few-shot' strategy prompt construction and ExperimentLog persistence."""
  with (
    patch.object(orchestrator.llm, "generate_arena_competition", new=AsyncMock(return_value=[])) as mock_gen,
    patch("app.services.prompt_engineering.few_shot_rag.TemplateRetriever.find_relevant_examples") as mock_find,
  ):
    mock_find.return_value = [{"question": "How many beds?", "sql": "SELECT count(*) FROM beds"}]

    res = await orchestrator.run_arena_experiment("Count beds", db_session, persisted_user, strategy="rag-few-shot")

    call_args = mock_gen.call_args
    messages = call_args[1]["messages"]
    user_msg = messages[1]["content"]

    assert "valid SQL examples" in user_msg
    assert "SELECT count(*) FROM beds" in user_msg

  exp = (await db_session.execute(select(ExperimentLog).where(ExperimentLog.id == res.id))).scalars().first()
  assert exp is not None
  assert exp.prompt_strategy == "rag-few-shot"


@pytest.mark.asyncio
async def test_run_arena_uses_cot_messages(
  orchestrator: SQLGeneratorService,
  db_session: AsyncSession,
  persisted_user: User,
) -> None:
  """Verify 'cot-macro' strategy prompt construction and ExperimentLog persistence."""
  with patch.object(orchestrator.llm, "generate_arena_competition", new=AsyncMock(return_value=[])) as mock_gen:
    res = await orchestrator.run_arena_experiment("Analyze risk", db_session, persisted_user, strategy="cot-macro")

    call_args = mock_gen.call_args
    messages = call_args[1]["messages"]
    system_msg = messages[0]["content"]

    assert "AVAILABLE ANALYTIC MACROS" in system_msg

  exp = (await db_session.execute(select(ExperimentLog).where(ExperimentLog.id == res.id))).scalars().first()
  assert exp is not None
  assert exp.prompt_strategy == "cot-macro"
