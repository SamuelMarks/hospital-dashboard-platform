"""
Integration Tests for Prompt Strategies against real database persistence.

Verifies that `SQLGeneratorService` correctly instantiates and utilizes different
`PromptStrategy` implementations (Zero-Shot, CoT, RAG) and persists `ExperimentLog`
records with the corresponding `prompt_strategy` tag using strongly typed test doubles.
"""

from collections.abc import Sequence
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.duckdb import DuckDBConnectionProtocol
from app.models.feedback import ExperimentLog
from app.models.user import User
from app.schemas.admin import AdminSettingsResponse
from app.services.llm_client import ArenaResponse, LLMArenaClient
from app.services.schema import SchemaService
from app.services.sql_generator import SQLGeneratorService


class FakeSchemaService(SchemaService):
  """
  Deterministic typed `SchemaService` test double returning a fixed DDL schema string.
  """

  def get_schema_context_string(self, conn: DuckDBConnectionProtocol | None = None) -> str:
    """
    Returns a deterministic DuckDB DDL schema context string.

    Args:
        conn (DuckDBConnectionProtocol | None): Ignored DuckDB connection override.

    Returns:
        str: Fixed `CREATE TABLE` DDL string.
    """
    _ = conn
    return "CREATE TABLE t (id INT);"


class FakeLLMArenaClient(LLMArenaClient):
  """
  Deterministic typed `LLMArenaClient` test double capturing prompt messages and returning canned candidates.

  Attributes:
      captured_messages (list[dict[str, str]]): Most recent prompt messages passed to `generate_arena_competition`.
      canned_responses (list[ArenaResponse]): Pre-configured arena responses to return.
  """

  def __init__(self, canned_responses: Sequence[ArenaResponse] | None = None) -> None:
    """
    Initializes the fake LLM Arena client without invoking live network discovery.

    Args:
        canned_responses (Sequence[ArenaResponse] | None): Optional canned candidate responses.
    """
    super().__init__()
    self.captured_messages: list[dict[str, str]] = []
    self.canned_responses: list[ArenaResponse] = list(canned_responses or [])

  async def generate_arena_competition(
    self,
    messages: list[dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 512,
    stop: list[str] | None = None,
    target_model_ids: list[str] | None = None,
    admin_settings: AdminSettingsResponse | None = None,
  ) -> list[ArenaResponse]:
    """
    Records `messages` and returns `self.canned_responses`.

    Args:
        messages (list[dict[str, str]]): Prompt messages list (`system` and `user`).
        temperature (float): Sampling temperature.
        max_tokens (int): Maximum tokens.
        stop (list[str] | None): Optional stop sequences.
        target_model_ids (list[str] | None): Optional candidate filter list.
        admin_settings (AdminSettingsResponse | None): Optional admin settings.

    Returns:
        list[ArenaResponse]: Configured canned responses.
    """
    _ = (temperature, max_tokens, stop, target_model_ids, admin_settings)
    self.captured_messages = list(messages)
    return list(self.canned_responses)


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
  """
  Returns an instance of `SQLGeneratorService` wired with `FakeSchemaService` and `FakeLLMArenaClient`.

  Returns:
      SQLGeneratorService: Configured SQL generator service instance.
  """
  svc = SQLGeneratorService()
  svc.schema_svc = FakeSchemaService()
  svc.llm = FakeLLMArenaClient()
  return svc


@pytest.mark.asyncio
async def test_run_arena_uses_zero_shot_messages(
  orchestrator: SQLGeneratorService,
  db_session: AsyncSession,
  persisted_user: User,
) -> None:
  """Verify 'zero-shot' strategy prompt construction and ExperimentLog persistence."""
  fake_llm = FakeLLMArenaClient([ArenaResponse("Model A", "id-a", "SELECT 1", 100, None)])
  orchestrator.llm = fake_llm

  res = await orchestrator.run_arena_experiment("Count patients", db_session, persisted_user, strategy="zero-shot")

  system_msg = fake_llm.captured_messages[0]["content"]
  user_msg = fake_llm.captured_messages[1]["content"]

  assert "expert data analyst" in system_msg.lower()
  assert "CREATE TABLE t (id INT);" in user_msg
  assert "valid sql examples" not in user_msg.lower()

  exp = (await db_session.execute(select(ExperimentLog).where(ExperimentLog.id == res.id))).scalars().first()
  assert exp is not None
  assert exp.prompt_strategy == "zero-shot"


@pytest.mark.asyncio
async def test_run_arena_uses_rag_messages(
  orchestrator: SQLGeneratorService,
  db_session: AsyncSession,
  persisted_user: User,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  """Verify 'rag-few-shot' strategy prompt construction and ExperimentLog persistence."""
  fake_llm = FakeLLMArenaClient()
  orchestrator.llm = fake_llm
  monkeypatch.setattr(
    "app.services.prompt_engineering.few_shot_rag.TemplateRetriever.find_relevant_examples",
    lambda _self, _q, limit=3: [{"question": "How many beds?", "sql": "SELECT count(*) FROM beds"}],
  )

  res = await orchestrator.run_arena_experiment("Count beds", db_session, persisted_user, strategy="rag-few-shot")

  user_msg = fake_llm.captured_messages[1]["content"]
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
  fake_llm = FakeLLMArenaClient()
  orchestrator.llm = fake_llm

  res = await orchestrator.run_arena_experiment("Analyze risk", db_session, persisted_user, strategy="cot-macro")

  system_msg = fake_llm.captured_messages[0]["content"]
  assert "AVAILABLE ANALYTIC MACROS" in system_msg

  exp = (await db_session.execute(select(ExperimentLog).where(ExperimentLog.id == res.id))).scalars().first()
  assert exp is not None
  assert exp.prompt_strategy == "cot-macro"
