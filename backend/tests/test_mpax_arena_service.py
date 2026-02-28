import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.mpax_arena_service import MpaxArenaService
from app.schemas.mpax_arena import MpaxArenaRequest
from app.models.user import User


@pytest.fixture
def service():
  return MpaxArenaService()


@pytest.fixture
def mock_user():
  return User(id="user1")


@pytest.fixture
def mock_db():
  return AsyncMock()


@pytest.mark.asyncio
async def test_run_mpax_arena_invalid_mode(service, mock_db, mock_user):
  req = MpaxArenaRequest(prompt="Test", mode="invalid_mode")
  with pytest.raises(ValueError, match="Unknown mode"):
    await service.run_mpax_arena(req, mock_db, mock_user)


@pytest.mark.asyncio
async def test_run_judge_mode(service, mock_db, mock_user):
  req = MpaxArenaRequest(prompt="Test", mode="judge", demand_sql="SELECT 1")

  with patch.object(service, "_get_demand_data", return_value=[{"a": 1}]):
    with patch("app.services.mpax_arena_service.simulation_service.run_scenario") as mock_sim:
      mock_sim.return_value.model_dump.return_value = {"status": "ok"}
      with patch(
        "app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock
      ) as mock_llm:
        mock_llm.return_value = [MagicMock(provider_name="m1", content="```sql\nSELECT 1\n```")]

        res = await service.run_mpax_arena(req, mock_db, mock_user)
        assert res.mode == "judge"
        assert len(res.candidates) == 1


@pytest.mark.asyncio
async def test_run_translator_mode(service, mock_db, mock_user):
  req = MpaxArenaRequest(prompt="Test", mode="translator")

  with patch("app.services.mpax_arena_service.simulation_service.run_scenario") as mock_sim:
    mock_sim.return_value.model_dump.return_value = {"status": "ok"}
    mock_sim.return_value.model_dump_json.return_value = "{}"
    with patch(
      "app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock
    ) as mock_llm:
      mock_llm.return_value = [MagicMock(provider_name="m1", content="Answer")]

      res = await service.run_mpax_arena(req, mock_db, mock_user)
      assert res.mode == "translator"
      assert len(res.candidates) == 1


@pytest.mark.asyncio
async def test_run_constraints_mode(service, mock_db, mock_user):
  req = MpaxArenaRequest(prompt="Test", mode="constraints")

  with patch("app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm:
    mock_llm.return_value = [
      MagicMock(provider_name="m1", content='{"ICU": 20}'),
      MagicMock(provider_name="m2", content="} bad json {"),
      MagicMock(provider_name="m3", content="{ bad }"),
      MagicMock(provider_name="m4", content="no brackets here"),
    ]
    with patch("app.services.mpax_arena_service.simulation_service.run_scenario") as mock_sim:
      mock_sim.return_value.model_dump.return_value = {"status": "ok"}
      # test failure branch for m2
      mock_sim.side_effect = [MagicMock(), Exception("Sim fail"), MagicMock(), MagicMock()]

      res = await service.run_mpax_arena(req, mock_db, mock_user)
      assert res.mode == "constraints"
      assert len(res.candidates) == 4
      assert res.candidates[1].mpax_result["status"] == "error"


@pytest.mark.asyncio
async def test_run_sql_vs_mpax_mode(service, mock_db, mock_user):
  req = MpaxArenaRequest(prompt="Test", mode="sql_vs_mpax")

  with patch("app.services.mpax_arena_service.simulation_service.run_scenario") as mock_sim:
    mock_sim.return_value.model_dump.return_value = {"status": "ok"}
    with patch(
      "app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock
    ) as mock_llm:
      mock_llm.return_value = [
        MagicMock(provider_name="m1", content="```sql\nSELECT 1\n```"),
        MagicMock(provider_name="m2", content="No SQL"),
        MagicMock(provider_name="m3", content="```sql\nSELECT 2\n```"),
      ]

      res = await service.run_mpax_arena(req, mock_db, mock_user)
      assert res.mode == "sql_vs_mpax"
      assert len(res.candidates) == 3
      assert res.candidates[0].sql_snippet == "SELECT 1"
      assert res.candidates[1].sql_snippet is None
      assert res.candidates[2].sql_snippet == "SELECT 2"


@pytest.mark.asyncio
async def test_run_critic_mode(service, mock_db, mock_user):
  req = MpaxArenaRequest(prompt="Test", mode="critic")

  with patch("app.services.mpax_arena_service.llm_client.generate_arena_competition", new_callable=AsyncMock) as mock_llm:
    mock_llm.return_value = [
      MagicMock(provider_name="m1", content='{"ICU": 20}'),
      MagicMock(provider_name="m2", content="} bad json {"),
      MagicMock(provider_name="m3", content="{ bad }"),
      MagicMock(provider_name="m4", content="no brackets here"),
    ]
    with patch("app.services.mpax_arena_service.simulation_service.run_scenario") as mock_sim:
      good_res = MagicMock()
      good_res.assignments = [MagicMock(Unit="ICU", Patient_Count=5), MagicMock(Unit="Overflow", Patient_Count=2)]
      good_res.model_dump.return_value = {"status": "ok"}
      mock_sim.side_effect = [good_res, Exception("Sim fail"), good_res, good_res]

      res = await service.run_mpax_arena(req, mock_db, mock_user)
      assert res.mode == "critic"
      assert len(res.candidates) == 4
      assert res.candidates[0].mpax_score == 90  # 100 - (2*5)
      assert res.candidates[1].mpax_score == 0


def test_get_demand_data_empty(service):
  assert service._get_demand_data("") == []


def test_get_demand_data_valid(service):
  with patch("app.services.mpax_arena_service.duckdb_manager.get_readonly_connection") as mock_conn:
    mock_cursor = mock_conn.return_value.cursor.return_value
    mock_cursor.description = [("col1",), ("col2",)]
    mock_cursor.fetchall.return_value = [(1, "A"), (2, "B")]

    data = service._get_demand_data("SELECT *")
    assert len(data) == 2
    assert data[0]["col1"] == 1


def test_extract_sql(service):
  assert service._extract_sql("```sql\n SELECT 1 \n```") == "SELECT 1"
  assert service._extract_sql("SELECT 1") == None
