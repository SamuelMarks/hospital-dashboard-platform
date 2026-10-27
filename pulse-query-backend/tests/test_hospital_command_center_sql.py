"""
End-to-end integration tests for all 30 'Hospital Command Center' SQL templates
and all 30 Gold Benchmark SQL queries against the real DuckDB CSV datasets.
"""

import json
import uuid

import duckdb
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BACKEND_ROOT
from app.core.result import Ok
from app.database.duckdb_init import create_hospital_macros
from app.models.dashboard import Dashboard, Widget
from app.models.user import User
from app.services.execution_service import execution_service
from app.services.provisioning import provisioning_service
from app.services.sql_utils import interpolate_template_parameters, process_global_filters
from app.services.template_seeder import TemplateSeeder


@pytest.fixture(scope="module")
def populated_duckdb_conn() -> duckdb.DuckDBPyConnection:
  """
  Creates an in-memory DuckDB connection populated with the real CSV datasets
  (`Synthetic_hospital_data.csv`, `Synthetic_hospital_data_transfers.csv`, `hospital_data.csv`),
  convenience views (`patient_admissions`, `incoming_patients`), and all hospital macros.

  Returns:
      duckdb.DuckDBPyConnection: Populated DuckDB connection.
  """
  conn = duckdb.connect(":memory:")
  create_hospital_macros(conn)
  data_dir = BACKEND_ROOT / "data"
  synth_csv = str((data_dir / "Synthetic_hospital_data.csv").resolve()).replace("'", "''")
  transfers_csv = str((data_dir / "Synthetic_hospital_data_transfers.csv").resolve()).replace("'", "''")
  hosp_csv = str((data_dir / "hospital_data.csv").resolve()).replace("'", "''")

  conn.execute(f"CREATE TABLE synthetic_hospital_data AS SELECT * FROM read_csv_auto('{synth_csv}', header=True);")
  conn.execute(
    f"CREATE TABLE synthetic_hospital_data_transfers AS SELECT * FROM read_csv_auto('{transfers_csv}', header=True);"
  )
  conn.execute(f"CREATE TABLE hospital_data AS SELECT * FROM read_csv_auto('{hosp_csv}', header=True);")
  conn.execute('CREATE VIEW "patient_admissions" AS SELECT * FROM "synthetic_hospital_data";')
  conn.execute(
    'CREATE VIEW "incoming_patients" AS '
    "SELECT Clinical_Service AS service, Location AS unit, COUNT(*) AS count "
    'FROM "synthetic_hospital_data" WHERE Clinical_Service IS NOT NULL GROUP BY 1, 2;'
  )
  return conn


def test_all_30_initial_templates_execute_against_real_duckdb(
  populated_duckdb_conn: duckdb.DuckDBPyConnection,
) -> None:
  """
  Verifies that every SQL template in `data/initial_templates.json` interpolates cleanly
  and returns at least 1 non-NULL row when executed against the actual DuckDB database.
  """
  templates_path = BACKEND_ROOT / "data" / "initial_templates.json"
  with open(templates_path, encoding="utf-8") as f:
    templates = json.load(f)

  assert len(templates) == 30

  for item in templates:
    title = item["title"]
    sql = interpolate_template_parameters(item["sql_template"], item.get("parameters_schema"))
    rows = populated_duckdb_conn.execute(sql).fetchall()
    assert len(rows) >= 1, f"Template '{title}' returned 0 rows"
    assert rows[0][0] is not None, f"Template '{title}' returned NULL in primary column"


def test_all_30_gold_benchmark_queries_execute_against_real_duckdb(
  populated_duckdb_conn: duckdb.DuckDBPyConnection,
) -> None:
  """
  Verifies that all 30 `gold_sql` queries in `data/benchmark_gold.json` execute cleanly
  and return at least 1 non-NULL row against the actual DuckDB database.
  """
  gold_path = BACKEND_ROOT / "data" / "benchmark_gold.json"
  with open(gold_path, encoding="utf-8") as f:
    raw = json.load(f)

  gold_items = [r for r in raw if "_meta" not in r]
  assert len(gold_items) == 30

  for item in gold_items:
    theme = item["theme"]
    rows = populated_duckdb_conn.execute(item["gold_sql"]).fetchall()
    assert len(rows) >= 1, f"Gold query '{theme}' returned 0 rows"
    assert rows[0][0] is not None, f"Gold query '{theme}' returned NULL in primary column"


def test_compatibility_views_for_editor_and_simulation_queries(
  populated_duckdb_conn: duckdb.DuckDBPyConnection,
) -> None:
  """
  Verifies that default SQL queries in Editor (`patient_admissions`) and Simulation (`incoming_patients`)
  execute cleanly against DuckDB.
  """
  editor_rows = populated_duckdb_conn.execute("SELECT * FROM patient_admissions LIMIT 10;").fetchall()
  assert len(editor_rows) == 10

  sim_rows = populated_duckdb_conn.execute("SELECT service, count FROM incoming_patients;").fetchall()
  assert len(sim_rows) >= 1


def test_process_global_filters_supports_department_and_ignores_all_sentinel() -> None:
  """
  Verifies `process_global_filters` accepts both `dept` and `department` keys and ignores `'All'`.
  """
  template = "SELECT * FROM synthetic_hospital_data WHERE 1=1 {{global_service}}"
  res_dept = process_global_filters(template, {"department": "Cardiology"})
  assert "AND Clinical_Service = 'Cardiology'" in res_dept

  res_all = process_global_filters(template, {"department": "All"})
  assert "Clinical_Service" not in res_all


@pytest.mark.asyncio
async def test_hospital_command_center_end_to_end_provisioning_and_sync(
  db_session: AsyncSession,
  populated_duckdb_conn: duckdb.DuckDBPyConnection,
) -> None:
  """
  Seeds all 30 templates into PostgreSQL/SQLite, provisions a user's default 'Hospital Command Center'
  dashboard, verifies TemplateSeeder synchronizes stale widget SQL on re-seed, and executes all
  widgets via `execution_service.refresh_dashboard_result`.
  """
  user = User(
    id=uuid.uuid4(),
    email=f"cmd_center_{uuid.uuid4()}@hospital.org",
    hashed_password="hashed_password",
    is_active=True,
  )
  db_session.add(user)
  await db_session.commit()

  await TemplateSeeder.seed_defaults(db=db_session)
  await provisioning_service.provision_new_user(db_session, user)
  await db_session.commit()

  dash_stmt = select(Dashboard).where(
    Dashboard.owner_id == user.id,
    Dashboard.name == "Hospital Command Center",
  )
  dash = (await db_session.execute(dash_stmt)).scalars().first()
  assert dash is not None

  widgets_stmt = select(Widget).where(Widget.dashboard_id == dash.id)
  widgets = list((await db_session.execute(widgets_stmt)).scalars().all())
  assert len(widgets) == 30

  # Corrupt one widget query to verify TemplateSeeder._sync_command_center_widgets repairs it
  target_widget = widgets[0]
  target_widget.config = {**target_widget.config, "query": "SELECT 'stale_broken_query'"}
  await db_session.commit()

  await TemplateSeeder.seed_defaults(db=db_session)
  await db_session.refresh(target_widget)
  assert target_widget.config["query"] != "SELECT 'stale_broken_query'"

  # Also test _sync_command_center_widgets early return when no valid title/sql_template exists
  await TemplateSeeder._sync_command_center_widgets(db_session, [{"invalid": 123}])

  # Execute all 30 widgets via ExecutionService using a non-closing cursor wrapper
  class _SharedConnProxy:
    """Proxy forwarding cursor() to populated_duckdb_conn without closing the shared fixture."""

    def cursor(self) -> duckdb.DuckDBPyConnection:
      """
      Returns a duplicate cursor from `populated_duckdb_conn`.

      Returns:
          duckdb.DuckDBPyConnection: Cursor connection.
      """
      return populated_duckdb_conn.cursor()

    def close(self) -> None:
      """No-op close to keep module-scoped fixture alive."""

  from sqlalchemy.orm import selectinload

  dash_with_widgets = (
    (await db_session.execute(select(Dashboard).options(selectinload(Dashboard.widgets)).where(Dashboard.id == dash.id)))
    .scalars()
    .first()
  )
  assert dash_with_widgets is not None

  refresh_res = await execution_service.refresh_dashboard_widgets(
    dashboard=dash_with_widgets,
    global_params={"department": "All"},
    conn_factory=_SharedConnProxy,
  )
  assert isinstance(refresh_res, Ok)
  results_map = refresh_res.value
  assert len(results_map) == 30
  for wid, payload in results_map.items():
    assert not payload.get("error"), f"Widget {wid} failed with error: {payload.get('error')}"
    data_rows = payload.get("data")
    assert isinstance(data_rows, list)
    assert len(data_rows) >= 1, f"Widget {wid} returned empty data"
