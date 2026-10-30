"""
Tests for the Provisioning Service.

Verifies:
1. Integration with Template Registry.
2. Correct creation of Dashboard and Widget records.
3. Visualization heuristic logic.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dashboard import Dashboard, Widget
from app.models.template import WidgetTemplate
from app.models.user import User

# Import provisioning service
from app.services.provisioning import ProvisioningService

# Mock Data
MOCK_USER_ID = uuid.uuid4()
MOCK_TEMPLATES = [
  WidgetTemplate(id=uuid.uuid4(), title="Utilization Rate", sql_template="SELECT 1", category="Capacity"),
  WidgetTemplate(id=uuid.uuid4(), title="Patient Trends Over Time", sql_template="SELECT *", category="Flow"),
  WidgetTemplate(id=uuid.uuid4(), title="Service Breakdown", sql_template="SELECT *", category="Operations"),
]


@pytest.mark.asyncio
async def test_provision_new_user_creates_dashboard(db_session: AsyncSession) -> None:
  """
  Test that a dashboard is created for the user.
  Uses the real db_session from conftest (in-memory SQLite/Postgres).

  Marked with asyncio to handle async DB session.
  """
  # 1. Setup User
  user = User(id=MOCK_USER_ID, email="new@test.com", hashed_password="pw", is_active=True)
  db_session.add(user)

  # 2. Seed Templates (We need real rows since the service queries DB)
  for t in MOCK_TEMPLATES:
    db_session.add(t)
  await db_session.flush()

  # 3. Run Provisioning
  svc = ProvisioningService()
  await svc.provision_new_user(db_session, user)
  await db_session.commit()

  # 4. Verify Dashboard Created
  result = await db_session.execute(select(Dashboard).where(Dashboard.owner_id == MOCK_USER_ID))
  dash = result.scalars().first()
  assert dash is not None
  assert dash.name == "Hospital Command Center"

  # 5. Verify Widgets Created
  w_result = await db_session.execute(select(func.count(Widget.id)).where(Widget.dashboard_id == dash.id))
  count = w_result.scalar()
  assert count == 3  # Matches number of templates


def test_provisioning_heuristic_logic() -> None:
  """
  Unit test for the visualization determination logic.
  Made synchronous as the method under test is synchronous.
  """
  svc = ProvisioningService()

  # Case 1: Rate -> Metric
  t1 = WidgetTemplate(title="Admission Rate", sql_template="SELECT rate FROM t")
  assert svc._determine_visual_type(t1) == "metric"

  # Case 2: Over Time -> Bar Chart
  t2 = WidgetTemplate(title="Census Over Time", sql_template="SELECT dt, cnt FROM t")
  assert svc._determine_visual_type(t2) == "bar_chart"

  # Case 3: Breakdown -> Pie
  t3 = WidgetTemplate(title="Service Breakdown", sql_template="SELECT svc, cnt FROM t")
  assert svc._determine_visual_type(t3) == "pie"

  # Case 4: Default -> Table
  t4 = WidgetTemplate(title="Raw List", sql_template="SELECT * FROM t")
  assert svc._determine_visual_type(t4) == "table"

  # Case 5: Comparisons -> Bar Chart
  t5 = WidgetTemplate(title="Compare ICU vs PCU", sql_template="SELECT * FROM t GROUP BY unit")
  assert svc._determine_visual_type(t5) == "bar_chart"


def test_config_builder_injects_defaults() -> None:
  """
  Test that parameters in templates are replaced by defaults in the generated widget config.
  Made synchronous as the method under test is synchronous.
  """
  svc = ProvisioningService()

  t = WidgetTemplate(
    title="Scoped Query",
    sql_template="SELECT * FROM t WHERE unit = '{{unit}}'",
    parameters_schema={"properties": {"unit": {"type": "string", "default": "ICU_A"}}},
  )

  config = svc._build_config(t, "table")

  # Verify the placeholder {{unit}} was replaced with ICU_A
  assert "ICU_A" in str(config["query"])
  assert "{{unit}}" not in str(config["query"])


def test_config_builder_injects_numeric_defaults() -> None:
  """Numeric defaults should be injected without quoting."""
  svc = ProvisioningService()

  t = WidgetTemplate(
    title="Numeric Default",
    sql_template="SELECT * FROM t WHERE limit = {{limit}}",
    parameters_schema={"properties": {"limit": {"type": "integer", "default": 5}}},
  )

  config = svc._build_config(t, "table")

  assert "limit = 5" in str(config["query"])


@pytest.mark.asyncio
async def test_get_safe_dashboard_name_base_available() -> None:
  """If the base name is free, it should be returned as-is."""
  svc = ProvisioningService()
  db = MagicMock()

  result = MagicMock()
  result.scalars.return_value.first.return_value = None
  db.execute = AsyncMock(return_value=result)

  name = await svc._get_safe_dashboard_name(db, MOCK_USER_ID, svc.DEFAULT_DASHBOARD_NAME)
  assert name == svc.DEFAULT_DASHBOARD_NAME


@pytest.mark.asyncio
async def test_get_safe_dashboard_name_restored_fallback() -> None:
  """If base exists, use (Restored) when available."""
  svc = ProvisioningService()
  db = MagicMock()

  res_base = MagicMock()
  res_base.scalars.return_value.first.return_value = Dashboard(name=svc.DEFAULT_DASHBOARD_NAME, owner_id=MOCK_USER_ID)

  res_restored = MagicMock()
  res_restored.scalars.return_value.first.return_value = None

  db.execute = AsyncMock(side_effect=[res_base, res_restored])

  name = await svc._get_safe_dashboard_name(db, MOCK_USER_ID, svc.DEFAULT_DASHBOARD_NAME)
  assert name == f"{svc.DEFAULT_DASHBOARD_NAME} (Restored)"


@pytest.mark.asyncio
async def test_get_safe_dashboard_name_increments_suffix() -> None:
  """If restored names exist, increment the highest suffix."""
  svc = ProvisioningService()
  db = MagicMock()

  res_base = MagicMock()
  res_base.scalars.return_value.first.return_value = Dashboard(name=svc.DEFAULT_DASHBOARD_NAME, owner_id=MOCK_USER_ID)

  res_restored = MagicMock()
  res_restored.scalars.return_value.first.return_value = Dashboard(
    name=f"{svc.DEFAULT_DASHBOARD_NAME} (Restored)", owner_id=MOCK_USER_ID
  )

  res_existing = MagicMock()
  res_existing.scalars.return_value.all.return_value = [
    f"{svc.DEFAULT_DASHBOARD_NAME} (Restored 2)",
    f"{svc.DEFAULT_DASHBOARD_NAME} (Restored 7)",
  ]

  db.execute = AsyncMock(side_effect=[res_base, res_restored, res_existing])

  name = await svc._get_safe_dashboard_name(db, MOCK_USER_ID, svc.DEFAULT_DASHBOARD_NAME)
  assert name == f"{svc.DEFAULT_DASHBOARD_NAME} (Restored 8)"


@pytest.mark.asyncio
async def test_create_dashboard_from_templates_handles_empty_templates() -> None:
  """Provisioning should return an empty dashboard if no templates exist."""
  svc = ProvisioningService()
  db = MagicMock()
  db.add = MagicMock()

  result = MagicMock()
  result.scalars.return_value.all.return_value = []
  db.execute = AsyncMock(return_value=result)

  user = MagicMock()
  user.id = MOCK_USER_ID

  dashboard = await svc._create_dashboard_from_templates(db, user, "Empty Dash")

  assert dashboard.name == "Empty Dash"


@pytest.mark.asyncio
async def test_restore_defaults_calls_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
  """restore_defaults should orchestrate name resolution and dashboard creation."""
  svc = ProvisioningService()
  db = MagicMock()
  user = MagicMock()
  user.id = MOCK_USER_ID

  monkeypatch.setattr(svc, "_get_safe_dashboard_name", AsyncMock(return_value="Restored"))
  monkeypatch.setattr(svc, "_create_dashboard_from_templates", AsyncMock(return_value=MagicMock()))

  result = await svc.restore_defaults(db, user)
  assert result is not None


@pytest.mark.asyncio
async def test_provisioning_edge_branches(db_session: AsyncSession) -> None:
  """Verifies dashboard restoration suffix resolution and visual type heuristics on edge templates."""
  user = User(id=uuid.uuid4(), email=f"prov_{uuid.uuid4()}@test.com", hashed_password="pw", is_active=True)
  db_session.add(user)
  await db_session.commit()

  svc = ProvisioningService()
  initial_name = await svc._get_safe_dashboard_name(db_session, user.id, "Base")
  assert initial_name == "Base"
  db_session.add(Dashboard(id=uuid.uuid4(), name="Base", owner_id=user.id))
  db_session.add(Dashboard(id=uuid.uuid4(), name="Base (Restored)", owner_id=user.id))
  db_session.add(Dashboard(id=uuid.uuid4(), name="Base (Restored 1)", owner_id=user.id))
  db_session.add(Dashboard(id=uuid.uuid4(), name="Base (Restored abc)", owner_id=user.id))
  await db_session.commit()
  name = await svc._get_safe_dashboard_name(db_session, user.id, "Base")
  assert name == "Base (Restored 2)"

  t1 = WidgetTemplate(title="Rate", sql_template="SELECT rate FROM t GROUP BY rate")
  assert svc._determine_visual_type(t1) == "table"
  t2 = WidgetTemplate(title="Compare", sql_template="SELECT 1")
  assert svc._determine_visual_type(t2) == "bar_chart"
  t3 = WidgetTemplate(
    title="T", sql_template="SELECT {{num}}", parameters_schema={"properties": {"num": {"default": "10"}}}
  )
  assert svc._build_config(t3, "table") == {"query": "SELECT 10"}
  t4 = WidgetTemplate(
    title="T2",
    sql_template="SELECT {{num}} {{s}}",
    parameters_schema={"properties": {"num": {"default": 10}, "s": {"default": "a"}, "no_default": {}}},
  )
  assert svc._build_config(t4, "table") == {"query": "SELECT 10 a"}
  t5 = WidgetTemplate(
    title="Custom Template",
    description="  Explains patient flow  ",
    sql_template="SELECT 1",
    parameters_schema={},
  )
  assert svc._build_config(t5, "table") == {
    "query": "SELECT 1",
    "subtitle": "Explains patient flow",
    "description": "Explains patient flow",
  }


def test_widget_model_subtitle_property_and_setter() -> None:
  """Verifies `Widget.subtitle` getter fallback and setter branches on `Widget` ORM model."""
  w = Widget(title="Test", type="SQL", visualization="table", config={})
  assert w.subtitle is None

  # Fallback to description when subtitle is absent
  w.config = {"description": "  From description  "}
  assert w.subtitle == "From description"

  # Explicit subtitle takes precedence over description
  w.subtitle = "  Explicit Subtitle  "
  assert w.subtitle == "Explicit Subtitle"
  assert w.config["subtitle"] == "Explicit Subtitle"

  # Clearing subtitle removes it from config
  w.subtitle = "   "
  assert "subtitle" not in w.config
  assert w.subtitle == "From description"

  w.subtitle = None
  w.config = {"description": ""}
  assert w.subtitle is None


def test_all_initial_templates_execute_and_return_rows() -> None:
  """
  Verifies that every template in `initial_templates.json` has a blueprint subtitle,
  executes cleanly against the seeded DuckDB tables, and returns non-empty rows.
  """
  import json
  from pathlib import Path

  from app.database.duckdb import duckdb_manager
  from app.services.runners.sql import run_sql_widget

  templates_path = Path(__file__).resolve().parent.parent / "data" / "initial_templates.json"
  raw_templates = json.loads(templates_path.read_text(encoding="utf-8"))
  assert len(raw_templates) >= 30

  svc = ProvisioningService()
  conn = duckdb_manager.get_readonly_connection()
  try:
    cursor = conn.cursor()
    for item in raw_templates:
      tmpl = WidgetTemplate(
        title=item["title"],
        description=item["description"],
        category=item["category"],
        sql_template=item["sql_template"],
        parameters_schema=item.get("parameters_schema", {}),
      )
      viz = svc._determine_visual_type(tmpl)
      cfg = svc._build_config(tmpl, viz)
      assert "subtitle" in cfg
      assert isinstance(cfg["subtitle"], str)
      assert len(cfg["subtitle"]) > 10
      res = run_sql_widget(cursor, cfg)
      assert res.get("error") is None, f"Template '{tmpl.title}' failed with error: {res.get('error')}"
      rows = res.get("data", [])
      assert len(rows) >= 1, f"Template '{tmpl.title}' returned 0 rows"
  finally:
    conn.close()
