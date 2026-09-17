"""
Main Application Entry Point.

(Updated to include Chat Router registration)
"""

import asyncio
from contextlib import asynccontextmanager

import duckdb
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pydantic.root_model  # noqa: F401

from app.api.routers import (
  admin,
  admin_users,
  ai,
  alert_rules,
  analytics,
  auth,
  benchmarks,
  chat,
  dashboards,
  execution,
  mpax_arena,
  schema,
  simulation,
  system,
  templates,
  ws,
)
from app.core.config import settings
from app.core.diagnostics import check_configuration_hygiene
from app.database.duckdb import duckdb_manager
from app.database.duckdb_init import init_duckdb_on_startup
from app.database.postgres import Base, engine, validate_postgres_connection
from app.services.data_ingestion import data_ingestion_service
from app.services.template_seeder import TemplateSeeder


async def _background_ingest_loop(interval_minutes: int) -> None:
  """
  Periodically triggers DuckDB CSV re-ingestion in the background.

  Args:
      interval_minutes (int): Ingestion loop frequency in minutes.
  """
  while True:
    try:
      await asyncio.sleep(interval_minutes * 60)
      data_ingestion_service.ingest_all_csvs()
    except asyncio.CancelledError:
      break
    except Exception:
      pass


@asynccontextmanager
async def lifespan(app: FastAPI):
  """
  Lifespan context manager for the FastAPI application.
  """
  # 0. Settings Hygiene
  check_configuration_hygiene(settings)

  # 1. Postgres Initialization (Keys/Schema)
  await validate_postgres_connection(raise_on_error=False)
  async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)

  # 2. DuckDB Auto-Ingestion (Data Layer)
  duckdb_manager.validate_duckdb_storage()
  data_ingestion_service.ingest_all_csvs()

  # 3. Seed Content (Template Registry)
  await TemplateSeeder.seed_defaults()

  # 4. DuckDB Initialization (Macros/Functions)
  init_duckdb_on_startup()
  duckdb_manager.validate_duckdb_storage()

  # 5. Optional Background Re-ingestion Scheduler
  ingest_task = None
  if settings.AUTO_INGEST_INTERVAL_MINUTES > 0:
    ingest_task = asyncio.create_task(_background_ingest_loop(settings.AUTO_INGEST_INTERVAL_MINUTES))

  yield

  if ingest_task is not None:
    ingest_task.cancel()

  await engine.dispose()


app = FastAPI(
  title=settings.PROJECT_NAME,
  openapi_url=f"{settings.API_V1_STR}/openapi.json",
  description="Backend API for the Hospital Analytics Platform.",
  lifespan=lifespan,
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=settings.parsed_cors_origins,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.exception_handler(duckdb.CatalogException)
async def duckdb_catalog_exception_handler(_request: Request, exc: duckdb.CatalogException) -> JSONResponse:
  """
  Catches DuckDB catalog errors (e.g., missing tables or columns) and returns structured diagnostics.

  Args:
      _request (Request): Active HTTP request.
      exc (duckdb.CatalogException): Caught catalog exception.

  Returns:
      JSONResponse: Standardized error payload with remediation suggestions.
  """
  return JSONResponse(
    status_code=status.HTTP_404_NOT_FOUND,
    content={
      "code": "TABLE_NOT_FOUND",
      "message": "The requested analytics table or column does not exist in DuckDB.",
      "detail": str(exc),
      "remediation_hint": "Verify table name or ingest missing CSV datasets via POST /api/v1/system/reingest.",
    },
  )


@app.exception_handler(duckdb.DatabaseError)
async def duckdb_database_exception_handler(_request: Request, exc: duckdb.DatabaseError) -> JSONResponse:
  """
  Catches general DuckDB storage or engine errors and returns structured diagnostics.

  Args:
      _request (Request): Active HTTP request.
      exc (duckdb.DatabaseError): Caught database exception.

  Returns:
      JSONResponse: Standardized error payload with remediation suggestions.
  """
  return JSONResponse(
    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    content={
      "code": "DATABASE_ERROR",
      "message": "An analytics database engine error occurred.",
      "detail": str(exc),
      "remediation_hint": "Check DuckDB file permissions or storage lock states.",
    },
  )


app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(dashboards.router, prefix=f"{settings.API_V1_STR}/dashboards", tags=["dashboards"])
app.include_router(execution.router, prefix=f"{settings.API_V1_STR}/dashboards", tags=["execution"])
app.include_router(ai.router, prefix=f"{settings.API_V1_STR}/ai", tags=["ai"])
app.include_router(templates.router, prefix=f"{settings.API_V1_STR}/templates", tags=["templates"])
app.include_router(simulation.router, prefix=f"{settings.API_V1_STR}/simulation", tags=["simulation"])
app.include_router(schema.router, prefix=f"{settings.API_V1_STR}/schema", tags=["schema"])
# Register Chat Router
app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/conversations", tags=["chat"])
app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/chat", tags=["chat"])
# Register Analytics Router
app.include_router(analytics.router, prefix=f"{settings.API_V1_STR}/analytics", tags=["analytics"])
app.include_router(alert_rules.router, prefix=f"{settings.API_V1_STR}/analytics/alert-rules", tags=["alert-rules"])
app.include_router(ws.router, prefix=f"{settings.API_V1_STR}/ws", tags=["collaboration"])
# Register Admin Router
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])
app.include_router(admin_users.router, prefix=f"{settings.API_V1_STR}/admin/users", tags=["admin-users"])
app.include_router(mpax_arena.router, prefix=f"{settings.API_V1_STR}/mpax_arena", tags=["mpax_arena"])
app.include_router(benchmarks.router, prefix=f"{settings.API_V1_STR}/benchmarks", tags=["benchmarks"])
app.include_router(system.router, prefix=f"{settings.API_V1_STR}/system", tags=["system"])


@app.get("/")
def root() -> dict[str, str]:
  """Health check endpoint for the API root."""
  return {"message": "Hospital Analytics Platform API is running"}
