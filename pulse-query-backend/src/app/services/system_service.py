"""
System Health and Diagnostics Domain Service.

Encapsulates environment inspection, troubleshooting guide assembly,
and system health summary evaluation.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import os
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BACKEND_ROOT, settings
from app.core.diagnostics import check_configuration_hygiene, diagnostics_registry
from app.database.duckdb import duckdb_manager, run_in_duckdb_thread
from app.database.postgres import AsyncSessionLocal, validate_postgres_connection
from app.models.template import WidgetTemplate
from app.schemas.system import (
  DataHealthSchema,
  DiagnosticWarningSchema,
  DuckDbHealthSchema,
  LlmHealthSchema,
  PostgresHealthSchema,
  SystemDiagnosticsResponse,
  SystemHealthResponse,
  TemplateHealthSchema,
  TroubleshootingStep,
)

DEFAULT_DATA_DIR = str(BACKEND_ROOT / "data")
REQUIRED_CLINICAL_TABLES: tuple[str, ...] = (
  "hospital_data",
  "Synthetic_hospital_data_transfers",
)


def inspect_data_directory(data_dir: str | None = None) -> tuple[str, bool, list[str]]:
  """
  Inspects the local `data` directory on disk and lists available `.csv` files.

  Args:
      data_dir (str | None): Optional directory path override; defaults to `DEFAULT_DATA_DIR`.

  Returns:
      tuple[str, bool, list[str]]: Tuple of `(data_dir_path, exists_flag, csv_filenames)`.
  """
  target_dir = data_dir if data_dir is not None else DEFAULT_DATA_DIR
  exists = os.path.exists(target_dir)
  data_files = [f for f in os.listdir(target_dir) if f.endswith(".csv")] if exists else []
  return target_dir, exists, data_files


class SystemDiagnosticsService:
  """
  Domain service providing system health summaries and environment diagnostics.
  """

  async def _query_template_count(self, db: AsyncSession | None = None) -> int:
    """
    Queries the total number of seeded widget templates in PostgreSQL.

    Args:
        db (AsyncSession | None): Optional active database session.

    Returns:
        int: Count of widget templates in the database, falling back to registry state if unreachable.
    """
    if db is not None:
      res = await db.execute(select(func.count()).select_from(WidgetTemplate))
      return int(res.scalar_one_or_none() or 0)

    try:
      async with AsyncSessionLocal() as session:
        res = await session.execute(select(func.count()).select_from(WidgetTemplate))
        return int(res.scalar_one_or_none() or 0)
    except Exception:
      return int(diagnostics_registry.template_status.get("templates_loaded", 0))

  async def get_health_summary(
    self,
    db: AsyncSession | None = None,
    require_populated: bool = True,
  ) -> SystemHealthResponse:
    """
    Evaluates live health across PostgreSQL, DuckDB, clinical datasets, and templates.

    Args:
        db (AsyncSession | None): Optional database session for template count inspection.
        require_populated (bool): If True, empty datasets or templates mark status as 'unhealthy'.

    Returns:
        SystemHealthResponse: Aggregated system health summary.
    """
    check_configuration_hygiene(settings)
    pg_status = await validate_postgres_connection(raise_on_error=False)
    duck_status = await run_in_duckdb_thread(duckdb_manager.validate_duckdb_storage)

    pg_ok = pg_status.get("status") == "connected"
    duck_ok = duck_status.get("status") == "ready"

    row_counts: dict[str, int] = dict(duck_status.get("tables") or {})
    if "synthetic_hospital_data_transfers" in row_counts and "Synthetic_hospital_data_transfers" not in row_counts:
      row_counts["Synthetic_hospital_data_transfers"] = row_counts["synthetic_hospital_data_transfers"]
    elif "Synthetic_hospital_data_transfers" in row_counts and "synthetic_hospital_data_transfers" not in row_counts:
      row_counts["synthetic_hospital_data_transfers"] = row_counts["Synthetic_hospital_data_transfers"]

    unique_lower_counts: dict[str, int] = {}
    for table_name, count in row_counts.items():
      key = table_name.lower()
      unique_lower_counts[key] = max(unique_lower_counts.get(key, 0), max(count, 0))

    tables_list = list(row_counts.keys())
    table_count = len(unique_lower_counts)
    total_rows = sum(unique_lower_counts.values())
    has_required_tables = all(req in tables_list and row_counts.get(req, 0) > 0 for req in REQUIRED_CLINICAL_TABLES)

    if not duck_ok:
      dataset_status = "critical"
    elif table_count == 0 or total_rows == 0 or not has_required_tables:
      dataset_status = "empty"
    else:
      dataset_status = "ready"

    dataset_health = DataHealthSchema(
      status=dataset_status,
      table_count=table_count,
      tables=tables_list,
      has_default_data=bool(
        diagnostics_registry.data_status.get("has_default_data", False) or row_counts.get("hospital_data", 0) > 0
      ),
      fallback_generated=bool(diagnostics_registry.data_status.get("fallback_generated", False)),
      missing_files=list(diagnostics_registry.data_status.get("missing_files", [])),
      row_counts=row_counts,
    )

    if not pg_ok:
      template_status = "critical"
      template_count = 0
    else:
      template_count = await self._query_template_count(db=db)
      template_status = "empty" if template_count == 0 else "ready"

    template_health = TemplateHealthSchema(
      status=template_status,
      template_count=template_count,
      templates_loaded=template_count,
      has_templates=template_count > 0,
      missing_file=bool(diagnostics_registry.template_status.get("missing_file", False)),
    )

    diagnostics_registry.data_status.update(dataset_health.model_dump())
    diagnostics_registry.template_status.update(template_health.model_dump())

    if not pg_ok or not duck_ok or template_health.status == "critical" or dataset_health.status == "critical":
      overall_status = "critical"
    elif dataset_health.status == "empty" or template_health.status == "empty":
      overall_status = "unhealthy" if require_populated else "degraded"
    else:
      overall_status = "healthy"

    return SystemHealthResponse(
      status=overall_status,
      overall_status=overall_status,
      timestamp=datetime.now(timezone.utc).isoformat(),
      postgres=PostgresHealthSchema.model_validate(pg_status),
      duckdb=DuckDbHealthSchema.model_validate(duck_status),
      data=dataset_health,
      datasets=dataset_health,
      templates=template_health,
      llm=LlmHealthSchema.model_validate(diagnostics_registry.llm_status),
      warnings=[DiagnosticWarningSchema.model_validate(w.to_dict()) for w in diagnostics_registry.warnings],
    )

  async def build_diagnostics_response(self, db: AsyncSession | None = None) -> SystemDiagnosticsResponse:
    """
    Refreshes database and configuration health states and builds a `SystemDiagnosticsResponse`.

    Args:
        db (AsyncSession | None): Optional database session for template inspection.

    Returns:
        SystemDiagnosticsResponse: Detailed diagnostic summary with copyable fix commands.
    """
    health_summary = await self.get_health_summary(db=db, require_populated=True)
    data_dir, data_dir_exists, data_files = await asyncio.to_thread(inspect_data_directory)

    environment_checks: dict[str, Any] = {
      "postgres_server": settings.POSTGRES_SERVER,
      "postgres_port": settings.POSTGRES_PORT,
      "postgres_database": settings.POSTGRES_DB,
      "postgres_user": settings.POSTGRES_USER,
      "duckdb_path": settings.DUCKDB_PATH,
      "data_directory": data_dir,
      "data_directory_exists": data_dir_exists,
      "detected_csv_files": data_files,
      "secret_key_is_default": settings.SECRET_KEY == "CHANGEME_IN_PROD_SUPER_SECRET_KEY",
      "configured_llm_providers": [item["provider"] for item in settings.LLM_SWARM],
    }

    troubleshooting_guides: list[TroubleshootingStep] = [
      TroubleshootingStep(
        title="Start PostgreSQL Database Container",
        command="docker compose up -d postgres",
        description="Starts the local PostgreSQL container using Docker Compose with standard default credentials.",
      ),
      TroubleshootingStep(
        title="Verify PostgreSQL Accessibility",
        command=f"pg_isready -h {settings.POSTGRES_SERVER} -p {settings.POSTGRES_PORT} -U {settings.POSTGRES_USER}",
        description="Tests network connectivity and readiness of the PostgreSQL server instance.",
      ),
      TroubleshootingStep(
        title="Ingest Default Clinical Hospital Data",
        command="python scripts/ingest.py",
        description="Loads all CSV datasets from pulse-query-backend/data/ into the DuckDB OLAP database.",
      ),
      TroubleshootingStep(
        title="Start Backend Development Server",
        command="cd pulse-query-backend && uvicorn app.main:app --reload",
        description="Spins up the FastAPI backend application with live hot-reloading.",
      ),
    ]

    return SystemDiagnosticsResponse(
      health=health_summary,
      environment_checks=environment_checks,
      troubleshooting_guides=troubleshooting_guides,
    )


system_diagnostics_service = SystemDiagnosticsService()
