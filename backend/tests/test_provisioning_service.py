"""
Tests for the Provisioning Service.

Verifies:
1. Integration with Template Registry.
2. Correct creation of Dashboard and Widget records.
3. Visualization heuristic logic.
"""

import uuid
import pytest
from unittest.mock import MagicMock, AsyncMock
from sqlalchemy import select, func

# Import provisioning service
from app.services.provisioning import ProvisioningService
from app.models.user import User
from app.models.dashboard import Dashboard, Widget
from app.models.template import WidgetTemplate

# Mock Data
MOCK_USER_ID = uuid.uuid4()
MOCK_TEMPLATES = [
  WidgetTemplate(id=uuid.uuid4(), title="Utilization Rate", sql_template="SELECT 1", category="Capacity"),
  WidgetTemplate(id=uuid.uuid4(), title="Patient Trends Over Time", sql_template="SELECT *", category="Flow"),
  WidgetTemplate(id=uuid.uuid4(), title="Service Breakdown", sql_template="SELECT *", category="Operations"),
]


@pytest.mark.asyncio
async def test_provision_new_user_creates_dashboard(db_session):
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


def test_provisioning_heuristic_logic():
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


def test_config_builder_injects_defaults():
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
  assert "ICU_A" in config["query"]
  assert "{{unit}}" not in config["query"]


def test_config_builder_injects_numeric_defaults():
  """Numeric defaults should be injected without quoting."""
  svc = ProvisioningService()

  t = WidgetTemplate(
    title="Numeric Default",
    sql_template="SELECT * FROM t WHERE limit = {{limit}}",
    parameters_schema={"properties": {"limit": {"type": "integer", "default": 5}}},
  )

  config = svc._build_config(t, "table")

  assert "limit = 5" in config["query"]


@pytest.mark.asyncio
async def test_get_safe_dashboard_name_base_available():
  """If the base name is free, it should be returned as-is."""
  svc = ProvisioningService()
  db = MagicMock()

  result = MagicMock()
  result.scalars.return_value.first.return_value = None
  db.execute = AsyncMock(return_value=result)

  name = await svc._get_safe_dashboard_name(db, MOCK_USER_ID, svc.DEFAULT_DASHBOARD_NAME)
  assert name == svc.DEFAULT_DASHBOARD_NAME


@pytest.mark.asyncio
async def test_get_safe_dashboard_name_restored_fallback():
  """If base exists, use (Restored) when available."""
  svc = ProvisioningService()
  db = MagicMock()

  res_base = MagicMock()
  res_base.scalars.return_value.first.return_value = object()

  res_restored = MagicMock()
  res_restored.scalars.return_value.first.return_value = None

  db.execute = AsyncMock(side_effect=[res_base, res_restored])

  name = await svc._get_safe_dashboard_name(db, MOCK_USER_ID, svc.DEFAULT_DASHBOARD_NAME)
  assert name == f"{svc.DEFAULT_DASHBOARD_NAME} (Restored)"


@pytest.mark.asyncio
async def test_get_safe_dashboard_name_increments_suffix():
  """If restored names exist, increment the highest suffix."""
  svc = ProvisioningService()
  db = MagicMock()

  res_base = MagicMock()
  res_base.scalars.return_value.first.return_value = object()

  res_restored = MagicMock()
  res_restored.scalars.return_value.first.return_value = object()

  res_existing = MagicMock()
  res_existing.scalars.return_value.all.return_value = [
    f"{svc.DEFAULT_DASHBOARD_NAME} (Restored 2)",
    f"{svc.DEFAULT_DASHBOARD_NAME} (Restored 7)",
  ]

  db.execute = AsyncMock(side_effect=[res_base, res_restored, res_existing])

  name = await svc._get_safe_dashboard_name(db, MOCK_USER_ID, svc.DEFAULT_DASHBOARD_NAME)
  assert name == f"{svc.DEFAULT_DASHBOARD_NAME} (Restored 8)"


@pytest.mark.asyncio
async def test_create_dashboard_from_templates_handles_empty_templates():
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
async def test_restore_defaults_calls_helpers(monkeypatch):
  """restore_defaults should orchestrate name resolution and dashboard creation."""
  svc = ProvisioningService()
  db = MagicMock()
  user = MagicMock()
  user.id = MOCK_USER_ID

  monkeypatch.setattr(svc, "_get_safe_dashboard_name", AsyncMock(return_value="Restored"))
  monkeypatch.setattr(svc, "_create_dashboard_from_templates", AsyncMock(return_value=MagicMock()))

  result = await svc.restore_defaults(db, user)
  assert result is not None
