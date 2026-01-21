"""
Integration Tests for Prompt Strategies.

Verifies that the SQLGeneratorService correctly instantiates and utilizes different
PromptStrategies (Zero-Shot, CoT, RAG) based on input arguments.
"""

import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock, patch
from app.services.sql_generator import SQLGeneratorService
from app.services.llm_client import ArenaResponse
from app.models.user import User


@pytest.fixture
def mock_db_session() -> MagicMock:
  """Creates a mock async database session with Pydantic-compliant side effects."""
  session = MagicMock()
  session.flush = AsyncMock()
  session.commit = AsyncMock()
  session.add = MagicMock()

  # Side effect: Populate ID and CreatedAt on refresh
  async def mock_refresh(instance):
    if not instance.id:
      instance.id = uuid.uuid4()
    if not getattr(instance, "created_at", None):
      instance.created_at = datetime.now(timezone.utc)

  session.refresh = AsyncMock(side_effect=mock_refresh)
  return session


@pytest.fixture
def mock_user() -> User:
  """Creates a mock user."""
  u = User(email="test@user.com", hashed_password="pw")
  u.id = uuid.uuid4()
  return u


@pytest.fixture
def orchestrator() -> SQLGeneratorService:
  """Returns an instance of the service with mocked dependencies."""
  svc = SQLGeneratorService()
  svc.schema_svc = MagicMock()
  svc.schema_svc.get_schema_context_string.return_value = "CREATE TABLE t (id INT);"
  svc.llm = MagicMock()
  svc.llm.generate_arena_competition = AsyncMock(return_value=[])
  return svc


@pytest.mark.asyncio
async def test_run_arena_uses_zero_shot_messages(
  orchestrator: SQLGeneratorService, mock_db_session: MagicMock, mock_user: User
) -> None:
  """Verify 'zero-shot' strategy prompt construction."""
  orchestrator.llm.generate_arena_competition.return_value = [ArenaResponse("Model A", "id-a", "SELECT 1", 100, None)]

  await orchestrator.run_arena_experiment("Count patients", mock_db_session, mock_user, strategy="zero-shot")

  call_args = orchestrator.llm.generate_arena_competition.call_args
  messages = call_args[1]["messages"]
  system_msg = messages[0]["content"]
  user_msg = messages[1]["content"]

  assert "expert data analyst" in system_msg.lower()
  # Zero-shot does NOT include "valid sql examples"
  assert "valid sql examples" not in user_msg.lower()


@pytest.mark.asyncio
async def test_run_arena_uses_rag_messages(
  orchestrator: SQLGeneratorService, mock_db_session: MagicMock, mock_user: User
) -> None:
  """Verify 'rag-few-shot' strategy prompt construction."""
  with patch("app.services.prompt_engineering.few_shot_rag.TemplateRetriever.find_relevant_examples") as mock_find:
    mock_find.return_value = [{"question": "How many beds?", "sql": "SELECT count(*) FROM beds"}]

    await orchestrator.run_arena_experiment("Count beds", mock_db_session, mock_user, strategy="rag-few-shot")

    call_args = orchestrator.llm.generate_arena_competition.call_args
    messages = call_args[1]["messages"]
    user_msg = messages[1]["content"]

    # RAG must inject examples
    assert "valid SQL examples" in user_msg
    assert "SELECT count(*) FROM beds" in user_msg


@pytest.mark.asyncio
async def test_run_arena_uses_cot_messages(
  orchestrator: SQLGeneratorService, mock_db_session: MagicMock, mock_user: User
) -> None:
  """Verify 'cot-macro' strategy prompt construction."""
  await orchestrator.run_arena_experiment("Analyze risk", mock_db_session, mock_user, strategy="cot-macro")

  call_args = orchestrator.llm.generate_arena_competition.call_args
  messages = call_args[1]["messages"]
  system_msg = messages[0]["content"]
  user_msg = messages[1]["content"]

  # CoT must inject Macros documentation
  assert "AVAILABLE ANALYTIC MACROS" in system_msg
