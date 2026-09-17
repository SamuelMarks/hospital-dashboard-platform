import os
import tempfile
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.i18n import Translator
from app.core.security import create_access_token
from app.models.admin_setting import AdminSetting
from app.models.chat import Conversation, Message
from app.models.dashboard import Dashboard, Widget
from app.models.user import User
from app.schemas.simulation import ScenarioRunRequest
from app.services.simulation_service import SimulationService


@pytest.fixture
async def my_user(db_session: AsyncSession):
  user = User(id=uuid.uuid4(), email=f"u_{uuid.uuid4()}@test.com", hashed_password="x", is_active=True)
  db_session.add(user)
  await db_session.commit()
  return user


@pytest.fixture
def my_headers(my_user):
  token = create_access_token(my_user.id)
  return {"Authorization": f"Bearer {token}"}


def test_config_sqlite_alembic_branch():
  """Tests SQLALCHEMY_DATABASE_URI when USE_SQLITE_ALEMBIC is enabled."""
  with patch.dict(os.environ, {"USE_SQLITE_ALEMBIC": "1"}):
    s = Settings()
    uri = s.SQLALCHEMY_DATABASE_URI
    assert "sqlite" in uri


def test_i18n_invalid_json():
  """Tests safe handling of malformed JSON locale files."""
  with tempfile.TemporaryDirectory() as tmpdir:
    with open(os.path.join(tmpdir, "bad.json"), "w") as f:
      f.write("{malformed json")
    t = Translator()
    t.load_locales(tmpdir)


@pytest.mark.asyncio
async def test_chat_missing_branches(client: AsyncClient, db_session: AsyncSession, my_user, my_headers):
  conv = Conversation(user_id=my_user.id, title="Test")
  db_session.add(conv)
  await db_session.commit()

  msg_sys = Message(conversation_id=conv.id, role="system", content="sys")
  msg_usr = Message(conversation_id=conv.id, role="user", content="usr")
  db_session.add_all([msg_sys, msg_usr])
  await db_session.commit()

  from app.services.llm_client import ArenaResponse

  res_list = [[ArenaResponse("m1", "m1-v", "SEL 1", 100, None)], []]

  def se(*args, **kwargs):
    if res_list:
      return res_list.pop(0)
    return []

  with patch("app.api.routers.chat.llm_client.generate_arena_competition", side_effect=se):
    await client.post("/api/v1/chat/", json={"message": "Hi", "conversation_id": str(conv.id)}, headers=my_headers)

  # Create conversation with empty title but non-empty message (short and long)
  await client.post("/api/v1/conversations/", json={"title": "", "message": "First message"}, headers=my_headers)
  await client.post(
    "/api/v1/conversations/",
    json={"title": "", "message": "This is a long message that exceeds forty characters in length to test truncation."},
    headers=my_headers,
  )
  await client.post(
    "/api/v1/conversations/", json={"title": "Custom Title", "message": "Custom Message"}, headers=my_headers
  )
  await client.post("/api/v1/conversations/", json={"title": "Empty", "message": ""}, headers=my_headers)


@pytest.mark.asyncio
async def test_dashboards_missing_branches(client: AsyncClient, db_session: AsyncSession, my_user, my_headers):
  dash = Dashboard(id=uuid.uuid4(), name="d", owner_id=my_user.id)
  db_session.add(dash)
  await db_session.commit()
  w1 = Widget(id=uuid.uuid4(), dashboard_id=dash.id, title="w1", type="HTTP", visualization="SCALAR", config={"url": "u"})
  w_sql = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="w_s", type="SQL", visualization="TABLE", config={"query": "SELECT 1"}
  )
  w_sql_no_query = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="w_sq_nq", type="SQL", visualization="TABLE", config={}
  )
  db_session.add_all([w1, w_sql, w_sql_no_query])
  await db_session.commit()

  # Create HTTP widget
  await client.post(
    f"/api/v1/dashboards/{dash.id}/widgets",
    json={"title": "t", "type": "HTTP", "visualization": "table", "config": {"url": "https://api.test"}},
    headers=my_headers,
  )

  # Create SQL widget
  await client.post(
    f"/api/v1/dashboards/{dash.id}/widgets",
    json={"title": "sql_wid", "type": "SQL", "visualization": "table", "config": {"query": "SELECT 1;"}},
    headers=my_headers,
  )

  # Update widget with query
  await client.put(
    f"/api/v1/dashboards/widgets/{w_sql.id}",
    json={"title": "updated_sql", "config": {"query": "SELECT 2;"}},
    headers=my_headers,
  )

  # Update HTTP widget
  await client.put(f"/api/v1/dashboards/widgets/{w1.id}", json={"title": "t2", "config": {"x": 1}}, headers=my_headers)
  await client.put(
    f"/api/v1/dashboards/widgets/{w_sql_no_query.id}", json={"title": "t3", "config": {"y": 2}}, headers=my_headers
  )

  # Reorder with group and without group
  bad_id = str(uuid.uuid4())
  await client.post(
    f"/api/v1/dashboards/{dash.id}/reorder",
    json={
      "items": [
        {"id": str(w1.id), "order": 2, "group": None},
        {"id": bad_id, "order": 3, "group": "g"},
        {"id": str(w_sql.id), "order": 4, "group": "g2"},
      ]
    },
    headers=my_headers,
  )


@pytest.mark.asyncio
async def test_execution_missing_branches(client: AsyncClient, db_session: AsyncSession, my_user, my_headers):
  dash = Dashboard(id=uuid.uuid4(), name="exec_d", owner_id=my_user.id)
  db_session.add(dash)
  await db_session.commit()
  w_sql = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="w2", type="SQL", visualization="TABLE", config={"query": "SELECT 1;"}
  )
  w_http = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="w3", type="HTTP", visualization="SCALAR", config={"url": "u"}
  )
  db_session.add_all([w_sql, w_http])
  await db_session.commit()

  # Single widget refresh for SQL
  from app.services.cache_service import cache_service

  cache_service.clear()
  await client.post(f"/api/v1/execution/dashboard/{dash.id}/widgets/{w_sql.id}/refresh", headers=my_headers)

  # Single widget refresh for HTTP
  cache_service.clear()
  with patch("app.api.routers.execution.run_http_widget", new_callable=AsyncMock) as m_http:
    m_http.return_value = {"status": "ok", "data": [1]}
    await client.post(f"/api/v1/execution/dashboard/{dash.id}/widgets/{w_http.id}/refresh", headers=my_headers)

  # Batch execution with successful HTTP
  cache_service.clear()
  with patch("app.api.routers.execution.run_http_widget", new_callable=AsyncMock) as m_http:
    m_http.return_value = {"status": "ok", "data": [1]}
    await client.post(f"/api/v1/execution/dashboard/{dash.id}", headers=my_headers)

  # Batch execution with error HTTP
  cache_service.clear()
  with patch("app.api.routers.execution.run_http_widget", new_callable=AsyncMock) as m_http:
    m_http.return_value = {"error": "Failed"}
    await client.post(f"/api/v1/execution/dashboard/{dash.id}", headers=my_headers)

  # Add second SQL widget for testing batch exception branching
  w_sql_2 = Widget(
    id=uuid.uuid4(),
    dashboard_id=dash.id,
    title="w_sql_2",
    type="SQL",
    visualization="TABLE",
    config={"query": "SELECT 2;"},
  )
  db_session.add(w_sql_2)
  await db_session.commit()

  call_idx = 0

  def sql_runner_side_effect(c, cfg):
    nonlocal call_idx
    call_idx += 1
    if call_idx == 1:
      return {"error": "SQL Error"}
    raise Exception("DB Crash on 2nd widget")

  cache_service.clear()
  with patch("app.api.routers.execution.run_sql_widget", side_effect=sql_runner_side_effect):
    await client.post(f"/api/v1/execution/dashboard/{dash.id}", headers=my_headers)


@pytest.mark.asyncio
async def test_execution_multi_widget_branches(
  client: AsyncClient, db_session: AsyncSession, my_user, my_headers
) -> None:
  """
  Tests non-terminal loop edges (101->99, 197->193, 203->202) across multiple HTTP and SQL widgets.
  """
  from app.services.cache_service import cache_service

  dash = Dashboard(id=uuid.uuid4(), name="multi_exec_d", owner_id=my_user.id)
  db_session.add(dash)
  await db_session.flush()

  w_http_1 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="h1", type="HTTP", visualization="table", config={"url": "http1"}
  )
  w_http_2 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="h2", type="HTTP", visualization="table", config={"url": "http2"}
  )
  w_sql_1 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="s1", type="SQL", visualization="table", config={"query": "q1"}
  )
  w_sql_2 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="s2", type="SQL", visualization="table", config={"query": "q2"}
  )
  w_sql_3 = Widget(
    id=uuid.uuid4(), dashboard_id=dash.id, title="s3", type="SQL", visualization="table", config={"query": "q3"}
  )
  db_session.add_all([w_http_1, w_http_2, w_sql_1, w_sql_2, w_sql_3])
  await db_session.commit()

  from sqlalchemy import select

  check_dash = (await db_session.execute(select(Dashboard).where(Dashboard.id == dash.id))).scalars().first()
  print("CHECK DASH IN DB:", check_dash, "OWNER:", check_dash.owner_id if check_dash else None, "MY USER:", my_user.id)

  # Mock HTTP: h1 errors, h2 succeeds -> covers 101->99
  async def mock_http_impl(cfg, **kwargs):
    if cfg.get("url") == "http1":
      return {"error": "HTTP Error"}
    return {"status": "ok", "data": [1]}

  # Mock SQL: q1 errors, q2 succeeds, q3 throws -> covers 197->193 and 203->202
  def mock_sql_impl(cursor, cfg):
    q = cfg.get("query")
    if q == "q1":
      return {"error": "SQL Error"}
    elif q == "q2":
      return {"data": [{"val": 1}]}
    else:
      raise RuntimeError("Crash on q3")

  cache_service.clear()
  with patch("app.api.routers.execution.run_http_widget", side_effect=mock_http_impl):
    with patch("app.api.routers.execution.run_sql_widget", side_effect=mock_sql_impl):
      res = await client.post(f"/api/v1/dashboards/{dash.id}/refresh", headers=my_headers)
      assert res.status_code == 200


@pytest.mark.asyncio
async def test_simulation_eviction_and_three_cols():
  """Tests 3-column demand parsing and eviction delta generation."""
  svc = SimulationService()
  m_conn = MagicMock()
  # 3 columns: Service, Unit, Count
  m_conn.execute.return_value.fetchall.return_value = [("Cardiology", "ICU", 15.0)]
  with patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn):
    # Solver returns empty list, meaning Cardiology in ICU is evicted (count went from 15 to 0)
    with patch("app.services.mpax_bridge.MpaxBridgeService.solve_unit_assignment", return_value="[]"):
      res = svc.run_scenario(
        ScenarioRunRequest(
          demand_source_sql="SELECT 1",
          capacity_parameters={"ICU": 20},
        )
      )
      assert len(res.assignments) == 1
      assert res.assignments[0].Service == "Cardiology"
      assert res.assignments[0].Unit == "ICU"
      assert res.assignments[0].Patient_Count == 0.0
      assert res.assignments[0].Original_Count == 15.0
      assert res.assignments[0].Delta == -15.0


@pytest.mark.asyncio
async def test_admin_missing_branches(db_session: AsyncSession):
  from app.services.admin import get_admin_settings

  db_session.add(AdminSetting(setting_key="ignore", setting_value={"a": 1}))
  await db_session.commit()
  await get_admin_settings(db_session)


def test_data_ingestion_missing_branches():
  import os
  import tempfile

  from app.services.data_ingestion import DataIngestionService

  d = tempfile.mkdtemp()
  with open(os.path.join(d, "tbl.csv"), "w") as f:
    f.write("id,value\n1,10\n2,20\n")
  with patch("app.services.data_ingestion.DATA_DIR", d):
    DataIngestionService.ingest_all_csvs()


def test_mpax_missing_branches():
  from app.services.mpax_bridge import MpaxBridgeService

  b = MpaxBridgeService()

  with patch.object(b, "_get_var_index", return_value=0):
    b.solve_unit_assignment(
      '{"A": 10}', '{"U1": 20}', '{"A": {"U1": 5}}', '[{"type":"other"}, {"type":"force_flow","service":"X","unit":"U1"}]'
    )


@pytest.mark.asyncio
async def test_provisioning_missing_branches(db_session: AsyncSession, my_user):
  from app.models.template import WidgetTemplate
  from app.services.provisioning import ProvisioningService

  svc = ProvisioningService()
  await svc._get_safe_dashboard_name(db_session, my_user.id, "Base")
  db_session.add(Dashboard(id=uuid.uuid4(), name="Base", owner_id=my_user.id))
  db_session.add(Dashboard(id=uuid.uuid4(), name="Base (Restored)", owner_id=my_user.id))
  db_session.add(Dashboard(id=uuid.uuid4(), name="Base (Restored 1)", owner_id=my_user.id))
  db_session.add(Dashboard(id=uuid.uuid4(), name="Base (Restored abc)", owner_id=my_user.id))
  await db_session.commit()
  name = await svc._get_safe_dashboard_name(db_session, my_user.id, "Base")
  assert name == "Base (Restored 2)"

  t1 = WidgetTemplate(title="Rate", sql_template="SELECT rate FROM t GROUP BY rate")
  svc._determine_visual_type(t1)
  t2 = WidgetTemplate(title="Compare", sql_template="SELECT 1")
  svc._determine_visual_type(t2)
  t3 = WidgetTemplate(
    title="T", sql_template="SELECT {{num}}", parameters_schema={"properties": {"num": {"default": "10"}}}
  )
  svc._build_config(t3, "table")
  t4 = WidgetTemplate(
    title="T2",
    sql_template="SELECT {{num}} {{s}}",
    parameters_schema={"properties": {"num": {"default": 10}, "s": {"default": "a"}, "no_default": {}}},
  )
  svc._build_config(t4, "table")


def test_sql_utils_missing_branches():
  from app.services.sql_utils import _strip_sql_comments

  _strip_sql_comments("SELECT 1 /* unfinished")
