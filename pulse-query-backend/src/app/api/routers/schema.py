"""
Schema API Router.

Exposes endpoints to retrieve the structure of the analytical database (DuckDB).
Used primarily by the Frontend SQL Editor to provide schema-aware autocomplete/IntelliSense.
"""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api import deps
from app.models.user import User
from app.schemas.db_schema import TableInfo
from app.services.schema import schema_service

router = APIRouter()


@router.get("/", response_model=list[TableInfo])
async def get_database_schema(current_user: Annotated[User, Depends(deps.get_current_user)]) -> list[TableInfo]:
  """
  Retrieves the current OLAP database schema (Tables and Columns).

  This endpoint introspects the active DuckDB connection in a background worker
  thread via `asyncio.to_thread`, preventing blocking of the main event loop.

  Args:
      current_user (User): Authenticated user (required for access).

  Returns:
      list[TableInfo]: A structured list of tables and their column definitions.
  """
  _ = current_user
  raw_tables = await asyncio.to_thread(schema_service.get_schema_json)
  return [TableInfo.model_validate(t) for t in raw_tables]
