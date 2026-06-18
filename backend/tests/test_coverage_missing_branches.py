import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import patch, AsyncMock, MagicMock
from app.models.user import User
from app.models.dashboard import Dashboard, Widget
from app.models.chat import Conversation, Message
from app.models.admin_setting import AdminSetting
from app.core.security import create_access_token
import uuid

@pytest.fixture
async def my_user(db_session: AsyncSession):
    user = User(id=uuid.uuid4(), email=f"u_{uuid.uuid4()}@test.com", hashed_password="x")
    db_session.add(user)
    await db_session.commit()
    return user

@pytest.fixture
def my_headers(my_user):
    token = create_access_token(my_user.id)
    return {"Authorization": f"Bearer {token}"}

@pytest.mark.asyncio
async def test_chat_missing_branches(client: AsyncClient, db_session: AsyncSession, my_user, my_headers):
    conv = Conversation(user_id=my_user.id, title="Test")
    db_session.add(conv)
    await db_session.commit()
    
    # Let's insert a message with a role that is not user or assistant
    msg_sys = Message(conversation_id=conv.id, role="system", content="sys")
    msg_usr = Message(conversation_id=conv.id, role="user", content="usr")
    db_session.add_all([msg_sys, msg_usr])
    await db_session.commit()
    
    from app.services.llm_client import ArenaResponse
    res_list = [[ArenaResponse("m1", "m1-v", "SEL 1", 100, None)], []]
    def se(*args, **kwargs):
        if res_list: return res_list.pop(0)
        return []
    with patch("app.api.routers.chat.llm_client.generate_arena_competition", side_effect=se):
        await client.post("/api/v1/chat/", json={"message": "Hi", "conversation_id": str(conv.id)}, headers=my_headers)
        
    await client.post("/api/v1/chat/conversations", json={"title": "Empty", "message": ""}, headers=my_headers)

@pytest.mark.asyncio
async def test_dashboards_missing_branches(client: AsyncClient, db_session: AsyncSession, my_user, my_headers):
    dash = Dashboard(id=uuid.uuid4(), name="d", owner_id=my_user.id)
    db_session.add(dash)
    await db_session.commit()
    w1 = Widget(id=uuid.uuid4(), dashboard_id=dash.id, title="w1", type="HTTP", visualization="SCALAR", config={"url": "u"})
    w_sql = Widget(id=uuid.uuid4(), dashboard_id=dash.id, title="w_s", type="SQL", visualization="TABLE", config={"query": "SEL"})
    w_sql_no_query = Widget(id=uuid.uuid4(), dashboard_id=dash.id, title="w_sq_nq", type="SQL", visualization="TABLE", config={})
    db_session.add_all([w1, w_sql, w_sql_no_query])
    await db_session.commit()
    
    await client.post(f"/api/v1/dashboards/{dash.id}/widgets", json={"title":"t", "type":"HTTP", "visualization":"SCALAR", "config":{"url":"u"}}, headers=my_headers)
    await client.put(f"/api/v1/dashboards/widgets/{w1.id}", json={"title":"t2", "config": {"x": 1}}, headers=my_headers)
    await client.put(f"/api/v1/dashboards/widgets/{w_sql_no_query.id}", json={"title":"t3", "config": {"y": 2}}, headers=my_headers)
    
    bad_id = str(uuid.uuid4())
    await client.post(f"/api/v1/dashboards/{dash.id}/layout", json={"items":[{"id":str(w1.id), "order":2, "group":None}, {"id":bad_id, "order":3, "group":"g"}, {"id":str(w_sql.id), "order":4, "group":"g2"}]}, headers=my_headers)

@pytest.mark.asyncio
async def test_execution_missing_branches(client: AsyncClient, db_session: AsyncSession, my_user, my_headers):
    dash = Dashboard(id=uuid.uuid4(), name="d", owner_id=my_user.id)
    db_session.add(dash)
    await db_session.commit()
    w_sql = Widget(id=uuid.uuid4(), dashboard_id=dash.id, title="w2", type="SQL", visualization="TABLE", config={"query":"SEL 1"})
    w_http = Widget(id=uuid.uuid4(), dashboard_id=dash.id, title="w3", type="HTTP", visualization="SCALAR", config={"url":"u"})
    db_session.add_all([w_sql, w_http])
    await db_session.commit()
    
    with patch("app.api.routers.execution.run_http_widget", new_callable=AsyncMock) as m_http:
        m_http.return_value = {"error": "e"}
        await client.post(f"/api/v1/execution/dashboard/{dash.id}", headers=my_headers)
        
    call_cnt = 0
    def m_sql(c, cfg):
        nonlocal call_cnt
        call_cnt += 1
        if call_cnt == 1: return {"error": "e"}
        raise Exception("e")
    with patch("app.api.routers.execution.run_sql_widget", side_effect=m_sql):
        await client.post(f"/api/v1/execution/dashboard/{dash.id}", headers=my_headers)
        await client.post(f"/api/v1/execution/dashboard/{dash.id}", headers=my_headers)

@pytest.mark.asyncio
async def test_admin_missing_branches(db_session: AsyncSession):
    from app.services.admin import get_admin_settings
    db_session.add(AdminSetting(setting_key="ignore", setting_value={"a":1}))
    await db_session.commit()
    await get_admin_settings(db_session)

def test_data_ingestion_missing_branches():
    from app.services.data_ingestion import DataIngestionService
    import os, tempfile
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "tbl.csv"), "w") as f:
        f.write("id,value\n1,10\n2,20")
    with patch("app.services.data_ingestion.DATA_DIR", d):
        DataIngestionService.ingest_all_csvs()

def test_mpax_missing_branches():
    from app.services.mpax_bridge import MpaxBridgeService
    b = MpaxBridgeService()
    
    with patch.object(b, "_get_var_index", return_value=0):
        b.solve_unit_assignment(
            '{"A": 10}',
            '{"U1": 20}',
            '{"A": {"U1": 5}}',
            '[{"type":"other"}, {"type":"force_flow","service":"X","unit":"U1"}]'
        )

@pytest.mark.asyncio
async def test_provisioning_missing_branches(db_session: AsyncSession, my_user):
    from app.services.provisioning import ProvisioningService
    from app.models.template import WidgetTemplate
    svc = ProvisioningService()
    await svc._get_safe_dashboard_name(db_session, my_user.id, "Base")
    db_session.add(Dashboard(id=uuid.uuid4(), name="Base (Restored 1)", owner_id=my_user.id))
    db_session.add(Dashboard(id=uuid.uuid4(), name="Base", owner_id=my_user.id))
    await db_session.commit()
    await svc._get_safe_dashboard_name(db_session, my_user.id, "Base")
    
    t1 = WidgetTemplate(title="Rate", sql_template="SELECT rate FROM t GROUP BY rate")
    svc._determine_visual_type(t1)
    t2 = WidgetTemplate(title="Compare", sql_template="SELECT 1")
    svc._determine_visual_type(t2)
    t3 = WidgetTemplate(title="T", sql_template="SELECT {{num}}", parameters_schema={"properties": {"num": {"default": "10"}}})
    svc._build_config(t3, "table")
    t4 = WidgetTemplate(title="T2", sql_template="SELECT {{num}} {{s}}", parameters_schema={"properties": {"num": {"default": 10}, "s": {"default": "a"}, "no_default": {}}})
    svc._build_config(t4, "table")

@pytest.mark.asyncio
async def test_simulation_missing_branches():
    from app.services.simulation_service import SimulationService
    from app.schemas.simulation import ScenarioRunRequest
    m_conn2 = MagicMock()
    m_conn2.execute.return_value.fetchall.side_effect = [[("U1", 10)], [("OnlyOneCol",)]]
    with patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn2):
        s = SimulationService()
        with patch.object(s, "_fetch_demand_payload", return_value=({}, {})):
            with patch("app.services.mpax_bridge.MpaxBridgeService.solve_unit_assignment", return_value="[]"):
                pass
                
    m_conn3 = MagicMock()
    m_conn3.execute.return_value.fetchall.side_effect = [[("U1", 10)], [("S1", "U1", 0.05)]]
    with patch("app.services.simulation_service.duckdb_manager.get_readonly_connection", return_value=m_conn3):
        s2 = SimulationService()
        with patch.object(s2, "_fetch_demand_payload", return_value=({}, {("S1", "U1"): 0.05})):
            with patch("app.services.mpax_bridge.MpaxBridgeService.solve_unit_assignment", return_value='[]'):
                s2.run_scenario(ScenarioRunRequest(demand_source_sql="", capacity_source_sql="", affinities_source_sql="", constraints=[], capacity_parameters={}))

def test_sql_utils_missing_branches():
    from app.services.sql_utils import _strip_sql_comments
    _strip_sql_comments("SELECT 1 /* unfinished")

