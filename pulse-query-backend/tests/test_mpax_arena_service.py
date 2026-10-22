"""Tests for `MpaxArenaService` evaluation modes."""

from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, Err, ErrorCode, Ok
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


@pytest.fixture
def mock_user() -> User:
  """
  Returns a mock `User` instance with a valid UUID.

  Returns:
      User: User instance.
  """
  return User(id=uuid.uuid4(), email="arena@hospital.org", hashed_password="pw", is_active=True)


@pytest.fixture
def mock_db() -> MagicMock:
  """
  Returns a mock `AsyncSession` with synchronous `add` and async `commit`/`rollback`.

  Returns:
      MagicMock: Configured session mock.
  """
  db = MagicMock(spec=AsyncSession)
  db.add = MagicMock()
  db.commit = AsyncMock()
  db.rollback = AsyncMock()
  return db


@pytest.mark.asyncio
async def test_run_mpax_arena_invalid_mode(service: MpaxArenaService, mock_db: MagicMock, mock_user: User) -> None:
  """
  Verifies `run_mpax_arena` raises `ValueError` and `run_mpax_arena_result` returns `Err(MPAX_INVALID_MODE)`.

  Args:
      service (MpaxArenaService): Service under test.
      mock_db (MagicMock): Mock database session.
      mock_user (User): Authenticated user fixture.
  """
  req = MpaxArenaRequest(prompt="Test", mode="invalid_mode")
  res = await service.run_mpax_arena_result(req, mock_db, mock_user)
  assert isinstance(res, Err)
  assert res.error.code == ErrorCode.MPAX_INVALID_MODE
  with pytest.raises(ValueError, match="Unknown mode"):
    await service.run_mpax_arena(req, mock_db, mock_user)


@pytest.mark.asyncio
async def test_run_mpax_arena_empty_prompt_and_mode_results(
  service: MpaxArenaService, mock_db: MagicMock, mock_user: User
) -> None:
  """
  Verifies `run_mpax_arena_result` returns `Err(VALIDATION_ERROR)` for empty prompt or mode,
  and maps internal runtime errors to `Err(INTERNAL_ERROR)` / `RuntimeError`.

  Args:
      service (MpaxArenaService): Service under test.
      mock_db (MagicMock): Mock database session.
      mock_user (User): Authenticated user fixture.
  """
  empty_prompt_res = await service.run_mpax_arena_result(MpaxArenaRequest(prompt="  ", mode="judge"), mock_db, mock_user)
  assert isinstance(empty_prompt_res, Err)
  assert empty_prompt_res.error.code == ErrorCode.VALIDATION_ERROR

  empty_mode_res = await service.run_mpax_arena_result(MpaxArenaRequest(prompt="ok", mode=""), mock_db, mock_user)
  assert isinstance(empty_mode_res, Err)
  assert empty_mode_res.error.code == ErrorCode.VALIDATION_ERROR

  with patch.object(service, "_run_judge_mode", new=AsyncMock(side_effect=ValueError("Bad SQL"))):
    val_err = await service.run_mpax_arena_result(MpaxArenaRequest(prompt="ok", mode="judge"), mock_db, mock_user)
    assert isinstance(val_err, Err)
    assert val_err.error.code == ErrorCode.VALIDATION_ERROR

  with (
    patch.object(service, "_run_judge_mode", new=AsyncMock(side_effect=RuntimeError("Crash"))),
    pytest.raises(RuntimeError, match="MPAX Arena failed: Crash"),
  ):
    await service.run_mpax_arena(MpaxArenaRequest(prompt="ok", mode="judge"), mock_db, mock_user)


@pytest.mark.asyncio
async def test_run_judge_mode(service: MpaxArenaService, mock_db: MagicMock, mock_user: User) -> None:
  """
  Verifies `judge` mode fetches demand data, runs MPAX, and queries LLMs.

  Args:
      service (MpaxArenaService): Service under test.
      mock_db (MagicMock): Mock database session.
      mock_user (User): Authenticated user fixture.
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

    res = await service.run_mpax_arena(req, mock_db, mock_user)
    assert res.mode == "judge"
    assert len(res.candidates) == 1

  # Also verify Err from simulation_service propagates as ValueError / VALIDATION_ERROR
  with (
    patch.object(service, "_get_demand_data", return_value=[]),
    patch(
      "app.services.mpax_arena_service.simulation_service.run_scenario_async",
      new=AsyncMock(
        return_value=Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="Judge sim error", status_code=400))
      ),
    ),
  ):
    err_res = await service.run_mpax_arena_result(req, mock_db, mock_user)
    assert isinstance(err_res, Err)
    assert "Judge sim error" in err_res.error.message


@pytest.mark.asyncio
async def test_run_translator_mode(service: MpaxArenaService, mock_db: MagicMock, mock_user: User) -> None:
  """
  Verifies `translator` mode runs MPAX and prompts LLMs to summarize the output.

  Args:
      service (MpaxArenaService): Service under test.
      mock_db (MagicMock): Mock database session.
      mock_user (User): Authenticated user fixture.
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

    res = await service.run_mpax_arena(req, mock_db, mock_user)
    assert res.mode == "translator"
    assert len(res.candidates) == 1

  with patch(
    "app.services.mpax_arena_service.simulation_service.run_scenario_async",
    new=AsyncMock(
      return_value=Err(AppError(code=ErrorCode.VALIDATION_ERROR, message="Translator sim error", status_code=400))
    ),
  ):
    err_res = await service.run_mpax_arena_result(req, mock_db, mock_user)
    assert isinstance(err_res, Err)


@pytest.mark.asyncio
async def test_run_constraints_mode(service: MpaxArenaService, mock_db: MagicMock, mock_user: User) -> None:
  """
  Verifies `constraints` mode parses LLM JSON capacity dictionaries and runs MPAX for each candidate.

  Args:
      service (MpaxArenaService): Service under test.
      mock_db (MagicMock): Mock database session.
      mock_user (User): Authenticated user fixture.
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
      res = await service.run_mpax_arena(req, mock_db, mock_user)
      assert res.mode == "constraints"
      assert len(res.candidates) == 4
      assert res.candidates[1].mpax_result is not None
      assert res.candidates[1].mpax_result["status"] == "error"


@pytest.mark.asyncio
async def test_run_sql_vs_mpax_mode(service: MpaxArenaService, mock_db: MagicMock, mock_user: User) -> None:
  """
  Verifies `sql_vs_mpax` mode extracts SQL blocks from candidate responses alongside MPAX ground truth.

  Args:
      service (MpaxArenaService): Service under test.
      mock_db (MagicMock): Mock database session.
      mock_user (User): Authenticated user fixture.
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

    res = await service.run_mpax_arena(req, mock_db, mock_user)
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
    err_res = await service.run_mpax_arena_result(req, mock_db, mock_user)
    assert isinstance(err_res, Err)


@pytest.mark.asyncio
async def test_run_critic_mode(service: MpaxArenaService, mock_db: MagicMock, mock_user: User) -> None:
  """
  Verifies `critic` mode evaluates LLM-proposed unit capacities with MPAX and computes overflow penalty scores.

  Args:
      service (MpaxArenaService): Service under test.
      mock_db (MagicMock): Mock database session.
      mock_user (User): Authenticated user fixture.
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
      res = await service.run_mpax_arena(req, mock_db, mock_user)
      assert res.mode == "critic"
      assert len(res.candidates) == 4
      assert res.candidates[0].mpax_score == 90
      assert res.candidates[1].mpax_score == 0


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
