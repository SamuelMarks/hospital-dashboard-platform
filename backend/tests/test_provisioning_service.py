"""
Tests for the Provisioning Service.

Verifies:
1. Integration with Template Registry.
2. Correct creation of Dashboard and Widget records.
3. Visualization heuristic logic.
"""

import uuid
import pytest
from unittest.mock import MagicMock
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
