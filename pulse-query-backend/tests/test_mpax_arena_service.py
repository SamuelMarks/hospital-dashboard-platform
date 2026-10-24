"""Tests for `MpaxArenaService` evaluation modes against real database persistence."""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, Err, ErrorCode, Ok
from app.models.mpax_arena import MpaxArenaCandidateRecord, MpaxArenaRun
from app.models.user import User
from app.schemas.mpax_arena import MpaxArenaRequest
from app.schemas.simulation import ScenarioResult, SimulationAssignment
from app.services.mpax_arena_service import MpaxArenaService


@pytest.fixture
def service() -> MpaxArenaService:
  """
  Returns a fresh `MpaxArenaService` instance.

  Returns:
      MpaxArenaService: Service under test.
  """
  return MpaxArenaService()


@pytest_asyncio.fixture
async def arena_user(db_session: AsyncSession) -> User:
  """
  Creates and persists a real `User` in `db_session` for MPAX Arena runs.

  Args:
      db_session (AsyncSession): Active test database session.

  Returns:
      User: Persisted user entity.
  """
  user = User(id=uuid.uuid4(), email=f"arena_{uuid.uuid4()}@hospital.org", hashed_password="pw", is_active=True)
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)
  return user


@pytest.mark.asyncio
async def test_run_mpax_arena_invalid_mode(
  service: MpaxArenaService,
  db_session: AsyncSession,
  arena_user: User,
) -> None:
  """
  Verifies `run_mpax_arena` raises `ValueError` and `run_mpax_arena_result` returns `Err(MPAX_INVALID_MODE)`.

  Args:
      service (MpaxArenaService): Service under test.
      db_session (AsyncSession): Active test database session.
      arena_user (User): Authenticated user fixture.
  """
  req = MpaxArenaRequest(prompt="Test", mode="invalid_mode")
  res = await service.run_mpax_arena_result(req, db_session, arena_user)
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.MPAX_INVALID_MODE
  with pytest.raises(ValueError, match="Unknown mode"):
    await service.run_mpax_arena(req, db_session, arena_user)


@pytest.mark.asyncio
async def test_run_mpax_arena_empty_prompt_and_mode_results(
  service: MpaxArenaService,
  db_session: AsyncSession,
  arena_user: User,
) -> None:
  """
  Verifies `run_mpax_arena_result` returns `Err(VALIDATION_ERROR)` for empty prompt or mode,
  and maps internal runtime errors to `Err(INTERNAL_ERROR)` / `RuntimeError`.

  Args:
      service (MpaxArenaService): Service under test.
      db_session (AsyncSession): Active test database session.
      arena_user (User): Authenticated user fixture.
  """
  empty_prompt_res = await service.run_mpax_arena_result(
    MpaxArenaRequest(prompt="  ", mode="judge"), db_session, arena_user
  )
  assert isinstance(empty_prompt_res, Err)
  assert empty_prompt_res.error.code == ErrorCode.VALIDATION_ERROR

  empty_mode_res = await service.run_mpax_arena_result(MpaxArenaRequest(prompt="ok", mode=""), db_session, arena_user)
  assert isinstance(empty_mode_res, Err)
  assert empty_mode_res.error.code == ErrorCode.VALIDATION_ERROR

  with patch.object(service, "_run_judge_mode", new=AsyncMock(side_effect=ValueError("Bad SQL"))):
    val_err = await service.run_mpax_arena_result(MpaxArenaRequest(prompt="ok", mode="judge"), db_session, arena_user)
    assert isinstance(val_err, Err)
    assert val_err.error.code == ErrorCode.VALIDATION_ERROR

  with (
    patch.object(service, "_run_judge_mode", new=AsyncMock(side_effect=RuntimeError("Crash"))),
    pytest.raises(RuntimeError, match="MPAX Arena failed: Crash"),
  ):
    await service.run_mpax_arena(MpaxArenaRequest(prompt="ok", mode="judge"), db_session, arena_user)


@pytest.mark.asyncio
async def test_run_judge_mode(
  service: MpaxArenaService,
  db_session: AsyncSession,
  arena_user: User,
) -> None:
  """
  Verifies `judge` mode fetches demand data, runs MPAX, queries LLMs, and persists to `db_session`.

  Args:
      service (MpaxArenaService): Service under test.
      db_session (AsyncSession): Active test database session.
      arena_user (User): Authenticated user fixture.
  """
  req = MpaxArenaRequest(prompt="Test", mode="judge", demand_sql="SELECT 1")

  with (
    patch.object(service, "_get_demand_data", return_value=[{"a": 1}]),
    patch(
      "app.services.mpax_arena_service.simulation_service.run_scenario_async",
      new=AsyncMock(return_value=Ok(ScenarioResult(status="ok", assignments=[]))),
    ),
    patch("app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm,
  ):
    nl = chr(10)
    mock_llm.return_value = [MagicMock(provider_name="m1", content=f"```sql{nl}SELECT 1{nl}```")]

    res = await service.run_mpax_arena(req, db_session, arena_user)
    assert res.mode == "judge"
    assert len(res.candidates) == 1

  run_row = (
    (await db_session.execute(select(MpaxArenaRun).where(MpaxArenaRun.id == uuid.UUID(res.experiment_id))))
    .scalars()
    .first()
  )
  assert run_row is not None
  assert run_row.mode == "judge"

  with (
    patch.object(service, "_get_demand_data", return_value=[]),
    patch(
      "app.services.mpax_arena_service.simulation_service.run_scenario_async",
      new=AsyncMock(
        return_value=Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="Judge sim error", status_code=400))
      ),
    ),
  ):
    err_res = await service.run_mpax_arena_result(req, db_session, arena_user)
    assert isinstance(err_res, Err)
    assert "Judge sim error" in err_res.error.message


@pytest.mark.asyncio
async def test_run_translator_mode(
  service: MpaxArenaService,
  db_session: AsyncSession,
  arena_user: User,
) -> None:
  """
  Verifies `translator` mode runs MPAX, prompts LLMs to summarize the output, and persists to `db_session`.

  Args:
      service (MpaxArenaService): Service under test.
      db_session (AsyncSession): Active test database session.
      arena_user (User): Authenticated user fixture.
  """
  req = MpaxArenaRequest(prompt="Test", mode="translator")

  with (
    patch(
      "app.services.mpax_arena_service.simulation_service.run_scenario_async",
      new=AsyncMock(return_value=Ok(ScenarioResult(status="ok", assignments=[]))),
    ),
    patch("app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm,
  ):
    mock_llm.return_value = [MagicMock(provider_name="m1", content="Answer")]

    res = await service.run_mpax_arena(req, db_session, arena_user)
    assert res.mode == "translator"
    assert len(res.candidates) == 1

  with patch(
    "app.services.mpax_arena_service.simulation_service.run_scenario_async",
    new=AsyncMock(
      return_value=Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="Translator sim error", status_code=400))
    ),
  ):
    err_res = await service.run_mpax_arena_result(req, db_session, arena_user)
    assert isinstance(err_res, Err)


@pytest.mark.asyncio
async def test_run_constraints_mode(
  service: MpaxArenaService,
  db_session: AsyncSession,
  arena_user: User,
) -> None:
  """
  Verifies `constraints` mode parses LLM JSON capacity dictionaries and runs MPAX for each candidate.

  Args:
      service (MpaxArenaService): Service under test.
      db_session (AsyncSession): Active test database session.
      arena_user (User): Authenticated user fixture.
  """
  req = MpaxArenaRequest(prompt="Test", mode="constraints")

  with patch("app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm:
    mock_llm.return_value = [
      MagicMock(provider_name="m1", content='{"ICU": 20}'),
      MagicMock(provider_name="m2", content="} bad json {"),
      MagicMock(provider_name="m3", content="{ bad }"),
      MagicMock(provider_name="m4", content="no brackets here"),
    ]
    ok_sim = Ok(ScenarioResult(status="ok", assignments=[]))
    err_sim = Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="Sim fail", status_code=400))
    with patch(
      "app.services.mpax_arena_service.simulation_service.run_scenario_async",
      new=AsyncMock(side_effect=[ok_sim, err_sim, ok_sim, ok_sim]),
    ):
      res = await service.run_mpax_arena(req, db_session, arena_user)
      assert res.mode == "constraints"
      assert len(res.candidates) == 4
      assert res.candidates[1].mpax_result is not None
      assert res.candidates[1].mpax_result["status"] == "error"


@pytest.mark.asyncio
async def test_run_sql_vs_mpax_mode(
  service: MpaxArenaService,
  db_session: AsyncSession,
  arena_user: User,
) -> None:
  """
  Verifies `sql_vs_mpax` mode extracts SQL blocks from candidate responses alongside MPAX ground truth.

  Args:
      service (MpaxArenaService): Service under test.
      db_session (AsyncSession): Active test database session.
      arena_user (User): Authenticated user fixture.
  """
  req = MpaxArenaRequest(prompt="Test", mode="sql_vs_mpax")

  with (
    patch(
      "app.services.mpax_arena_service.simulation_service.run_scenario_async",
      new=AsyncMock(return_value=Ok(ScenarioResult(status="ok", assignments=[]))),
    ),
    patch("app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm,
  ):
    nl = chr(10)
    mock_llm.return_value = [
      MagicMock(provider_name="m1", content=f"```sql{nl}SELECT 1{nl}```"),
      MagicMock(provider_name="m2", content="No SQL"),
      MagicMock(provider_name="m3", content=f"```sql{nl}SELECT 2{nl}```"),
    ]

    res = await service.run_mpax_arena(req, db_session, arena_user)
    assert res.mode == "sql_vs_mpax"
    assert len(res.candidates) == 3
    assert res.candidates[0].sql_snippet == "SELECT 1"
    assert res.candidates[1].sql_snippet is None
    assert res.candidates[2].sql_snippet == "SELECT 2"

  with patch(
    "app.services.mpax_arena_service.simulation_service.run_scenario_async",
    new=AsyncMock(
      return_value=Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="SQL vs MPAX error", status_code=400))
    ),
  ):
    err_res = await service.run_mpax_arena_result(req, db_session, arena_user)
    assert isinstance(err_res, Err)


@pytest.mark.asyncio
async def test_run_critic_mode(
  service: MpaxArenaService,
  db_session: AsyncSession,
  arena_user: User,
) -> None:
  """
  Verifies `critic` mode evaluates LLM-proposed unit capacities with MPAX and persists scores to `db_session`.

  Args:
      service (MpaxArenaService): Service under test.
      db_session (AsyncSession): Active test database session.
      arena_user (User): Authenticated user fixture.
  """
  req = MpaxArenaRequest(prompt="Test", mode="critic")

  with patch("app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm:
    mock_llm.return_value = [
      MagicMock(provider_name="m1", content='{"ICU": 20}'),
      MagicMock(provider_name="m2", content="} bad json {"),
      MagicMock(provider_name="m3", content="{ bad }"),
      MagicMock(provider_name="m4", content="no brackets here"),
    ]
    good_res = Ok(
      ScenarioResult(
        status="ok",
        assignments=[
          SimulationAssignment(Service="Cardiology", Unit="ICU", Patient_Count=5.0),
          SimulationAssignment(Service="Cardiology", Unit="Overflow", Patient_Count=2.0),
        ],
      )
    )
    err_res = Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="Sim fail", status_code=400))
    with patch(
      "app.services.mpax_arena_service.simulation_service.run_scenario_async",
      new=AsyncMock(side_effect=[good_res, err_res, good_res, good_res]),
    ):
      res = await service.run_mpax_arena(req, db_session, arena_user)
      assert res.mode == "critic"
      assert len(res.candidates) == 4
      assert res.candidates[0].mpax_score == 90
      assert res.candidates[1].mpax_score == 0

  cand_rows = (
    (
      await db_session.execute(
        select(MpaxArenaCandidateRecord).where(MpaxArenaCandidateRecord.run_id == uuid.UUID(res.experiment_id))
      )
    )
    .scalars()
    .all()
  )
  assert len(cand_rows) == 4


def test_get_demand_data_empty(service: MpaxArenaService) -> None:
  """
  Verifies `_get_demand_data` returns an empty list when `sql` is empty.

  Args:
      service (MpaxArenaService): Service under test.
  """
  assert service._get_demand_data("") == []


def test_get_demand_data_valid(service: MpaxArenaService) -> None:
  """
  Verifies `_get_demand_data` executes the demand SQL query via `run_sql_widget`.

  Args:
      service (MpaxArenaService): Service under test.
  """
  with patch("app.services.mpax_arena_service.duckdb_manager.get_readonly_connection") as mock_conn:
    mock_cursor = mock_conn.return_value.cursor.return_value
    mock_cursor.description = [("col1",), ("col2",)]
    mock_cursor.fetchall.return_value = [(1, "A"), (2, "B")]

    data = service._get_demand_data("SELECT *")
    assert len(data) == 2
    assert data[0]["col1"] == 1


def test_extract_sql(service: MpaxArenaService) -> None:
  """
  Verifies `_extract_sql` extracts fenced SQL blocks and returns None for plain text.

  Args:
      service (MpaxArenaService): Service under test.
  """
  nl = chr(10)
  assert service._extract_sql(f"```sql{nl} SELECT 1 {nl}```") == "SELECT 1"
  assert service._extract_sql("SELECT 1") is None
