"""
Main Application Entry Point.

(Updated to include Chat Router registration)
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routers import (
  auth,
  dashboards,
  execution,
  ai,
  templates,
  simulation,
  schema,
  chat,
  analytics,
  admin,
  mpax_arena,
  benchmarks,
)
from app.database.postgres import engine, Base
from app.database.duckdb_init import init_duckdb_on_startup
from app.services.template_seeder import TemplateSeeder
from app.services.data_ingestion import data_ingestion_service


@asynccontextmanager
async def lifespan(app: FastAPI):
  """
  Lifespan context manager for the FastAPI application.
  """
  # 1. Postgres Initialization (Keys/Schema)
  async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)

  # 2. DuckDB Auto-Ingestion (Data Layer)
  data_ingestion_service.ingest_all_csvs()

  # 3. Seed Content (Template Registry)
  await TemplateSeeder.seed_defaults()

  # 4. DuckDB Initialization (Macros/Functions)
  init_duckdb_on_startup()

  yield

  await engine.dispose()


app = FastAPI(
  title=settings.PROJECT_NAME,
  openapi_url=f"{settings.API_V1_STR}/openapi.json",
  description="Backend API for the Hospital Analytics Platform.",
  lifespan=lifespan,
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
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
# Register Analytics Router
app.include_router(analytics.router, prefix=f"{settings.API_V1_STR}/analytics", tags=["analytics"])
# Register Admin Router
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])
app.include_router(mpax_arena.router, prefix=f"{settings.API_V1_STR}/mpax_arena", tags=["mpax_arena"])
app.include_router(benchmarks.router, prefix=f"{settings.API_V1_STR}/benchmarks", tags=["benchmarks"])


@app.get("/")
def root() -> dict[str, str]:
  """Health check endpoint for the API root."""
  return {"message": "Hospital Analytics Platform API is running"}
