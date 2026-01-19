"""
Schema API Router.

Exposes endpoints to retrieve the structure of the analytical database (DuckDB).
Used primarily by the Frontend SQL Editor to provide schema-aware autocomplete/IntelliSense.
"""

from typing import Annotated, List

from fastapi import APIRouter, Depends
from app.services.schema import schema_service
from app.schemas.db_schema import TableInfo
from app.api import deps
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[TableInfo])
def get_database_schema(current_user: Annotated[User, Depends(deps.get_current_user)]) -> List[TableInfo]:
  """
  Retrieve the current OLAP database schema (Tables and Columns).

  This endpoint introspects the active DuckDB connection.
  It is synchronous to ensure FastAPI executes it in a threadpool, preventing
  blocking of the main event loop during database I/O.

  Args:
      current_user: Authenticated user (required for access).

  Returns:
      List[TableInfo]: A structured list of tables and their column definitions.
  """
  # schema_service.get_schema_json returns List[Dict], which Pydantic
  # automatically validates against List[TableInfo] based on the response_model.
  return schema_service.get_schema_json()
