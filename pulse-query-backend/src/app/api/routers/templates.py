"""
Templates API Router.

Exposes CRUD and instantiation endpoints for the Widget Template Registry
by delegating domain logic to `TemplateService`.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import AppResult, unwrap_or_raise_http
from app.database.postgres import get_db
from app.models.template import WidgetTemplate
from app.models.user import User
from app.schemas.template import (
  TemplateCreate,
  TemplateInstantiateRequest,
  TemplateInstantiateResponse,
  TemplateResponse,
  TemplateUpdate,
)
from app.services.template_service import template_service

router = APIRouter()


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(
  db: Annotated[AsyncSession, Depends(get_db)],
  category: Annotated[str | None, Query(description="Filter templates by category")] = None,
  search: Annotated[str | None, Query(description="Search title or description")] = None,
  limit: Annotated[int, Query(description="Max records to return", ge=1, le=100)] = 30,
  current_user: User = Depends(deps.get_current_user),
) -> list[WidgetTemplate]:
  """
  Retrieve a list of available widget templates with filtering and pagination.

  Args:
      db (AsyncSession): Database session dependency.
      category (str | None): Filter templates by category name.
      search (str | None): Case-insensitive search term for title or description.
      limit (int): Maximum number of records to return.
      current_user (User): Authenticated user dependency.

  Returns:
      list[WidgetTemplate]: Filtered list of templates.
  """
  _ = current_user
  res = await template_service.list_templates_result(db=db, category=category, search=search, limit=limit)
  return unwrap_or_raise_http(res)


@router.post("/", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
  template_in: TemplateCreate,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: User = Depends(deps.get_current_user),
) -> WidgetTemplate:
  """
  Register a new analytics template in the system.

  Args:
      template_in (TemplateCreate): Validated template payload.
      db (AsyncSession): Database session.
      current_user (User): Authenticated user.

  Returns:
      WidgetTemplate: The persisted template object.
  """
  _ = current_user
  res = await template_service.create_template_result(template_in, db)
  return unwrap_or_raise_http(res)


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
  template_id: UUID,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: User = Depends(deps.get_current_user),
) -> WidgetTemplate:
  """
  Retrieve details for a specific template.

  Args:
      template_id (UUID): The unique ID of the template.
      db (AsyncSession): Database session.
      current_user (User): Authenticated user.

  Returns:
      WidgetTemplate: The requested template.

  Raises:
      HTTPException: 404 if not found.
  """
  _ = current_user
  res = await template_service.get_template_result(template_id, db)
  return unwrap_or_raise_http(res)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
  template_id: UUID,
  template_in: TemplateUpdate,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: User = Depends(deps.get_current_user),
) -> WidgetTemplate:
  """
  Update an existing template's definition.

  Args:
      template_id (UUID): The unique ID of the template.
      template_in (TemplateUpdate): Partial update payload.
      db (AsyncSession): Database session.
      current_user (User): Authenticated user.

  Returns:
      WidgetTemplate: The updated template.

  Raises:
      HTTPException: 404 if not found.
  """
  _ = current_user
  res = await template_service.update_template_result(template_id, template_in, db)
  return unwrap_or_raise_http(res)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
  template_id: UUID,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: User = Depends(deps.get_current_user),
) -> None:
  """
  Hard delete a template from the registry.

  Args:
      template_id (UUID): The unique ID of the template.
      db (AsyncSession): Database session.
      current_user (User): Authenticated user.

  Raises:
      HTTPException: 404 if not found.
  """
  _ = current_user
  res = await template_service.delete_template_result(template_id, db)
  unwrap_or_raise_http(res)


async def instantiate_template_result(
  template_id: UUID,
  payload: TemplateInstantiateRequest,
  db: AsyncSession,
) -> AppResult[TemplateInstantiateResponse]:
  """
  Delegates template instantiation to `template_service.instantiate_template_result`.

  Args:
      template_id (UUID): Unique identifier of the template to instantiate.
      payload (TemplateInstantiateRequest): Parameter key-value overrides.
      db (AsyncSession): Active database session.

  Returns:
      AppResult[TemplateInstantiateResponse]: `Ok(TemplateInstantiateResponse)` or `Err(AppError)` if not found.
  """
  return await template_service.instantiate_template_result(template_id, payload, db)


@router.post("/{template_id}/instantiate", response_model=TemplateInstantiateResponse)
async def instantiate_template(
  template_id: UUID,
  payload: TemplateInstantiateRequest,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: User = Depends(deps.get_current_user),
) -> TemplateInstantiateResponse:
  """
  Instantiates a widget template on the backend by substituting schema defaults
  and user-supplied parameter values into `sql_template`.

  Args:
      template_id (UUID): Unique identifier of the template to instantiate.
      payload (TemplateInstantiateRequest): User-supplied parameter values.
      db (AsyncSession): Database session.
      current_user (User): Authenticated user session.

  Returns:
      TemplateInstantiateResponse: Rendered SQL query, title, and recommended visualization.

  Raises:
      HTTPException: 404 if the template does not exist.
  """
  _ = current_user
  res = await instantiate_template_result(template_id, payload, db)
  return unwrap_or_raise_http(res)
