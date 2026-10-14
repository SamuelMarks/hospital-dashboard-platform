"""
Templates API Router.

This module exposes the CRUD endpoints for managing the Widget Template Registry.
Updated to support server-side searching and limiting to efficiently handle
large catalogs of analytics questions.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
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
from app.services.provisioning import provisioning_service
from app.services.sql_utils import interpolate_template_parameters

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
      category (Optional[str]): Filter templates by category name.
      search (Optional[str]): Case-insensitive search term for title or description.
      limit (int): Maximum number of records to return.
      current_user (User): Authenticated user dependency.

  Returns:
      List[WidgetTemplate]: Filtered list of templates.
  """
  query = select(WidgetTemplate)

  # Apply Category Filter
  if category:
    query = query.where(WidgetTemplate.category == category)

  # Apply Text Search
  if search:
    term = search.strip()
    pattern = f"%{term}%"

    # Search against Title and Description using case-insensitive ILIKE
    # OR logic automatically handles NULL values in description
    query = query.where(
      or_(
        WidgetTemplate.title.ilike(pattern),
        WidgetTemplate.description.ilike(pattern),
      )
    )

  # Apply Limit / Sort
  query = query.order_by(WidgetTemplate.title).limit(limit)

  result = await db.execute(query)
  return list(result.scalars().all())


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
  template = WidgetTemplate(
    title=template_in.title,
    description=template_in.description,
    sql_template=template_in.sql_template,
    category=template_in.category,
    parameters_schema=template_in.parameters_schema,
  )
  db.add(template)
  await db.commit()
  return template


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
  result = await db.execute(select(WidgetTemplate).where(WidgetTemplate.id == template_id))
  template = result.scalars().first()
  if not template:
    raise HTTPException(status_code=404, detail="Template not found")
  return template


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
  result = await db.execute(select(WidgetTemplate).where(WidgetTemplate.id == template_id))
  template = result.scalars().first()
  if not template:
    raise HTTPException(status_code=404, detail="Template not found")

  update_data = template_in.model_dump(exclude_unset=True)

  for key, value in update_data.items():
    setattr(template, key, value)

  await db.commit()
  return template


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
  result = await db.execute(select(WidgetTemplate).where(WidgetTemplate.id == template_id))
  template = result.scalars().first()
  if not template:
    raise HTTPException(status_code=404, detail="Template not found")

  await db.delete(template)
  await db.commit()


async def instantiate_template_result(
  template_id: UUID,
  payload: TemplateInstantiateRequest,
  db: AsyncSession,
) -> AppResult[TemplateInstantiateResponse]:
  """
  Resolves a `WidgetTemplate` by ID, interpolates its SQL parameters, and returns an `AppResult`.

  Args:
      template_id (UUID): Unique identifier of the template to instantiate.
      payload (TemplateInstantiateRequest): Parameter key-value overrides.
      db (AsyncSession): Active database session.

  Returns:
      AppResult[TemplateInstantiateResponse]: `Ok(TemplateInstantiateResponse)` or `Err(AppError)` if not found.
  """
  result = await db.execute(select(WidgetTemplate).where(WidgetTemplate.id == template_id))
  template = result.scalars().first()
  if not template:
    return Err(
      AppError(
        code=ErrorCode.RESOURCE_NOT_FOUND,
        message="Template not found",
        status_code=status.HTTP_404_NOT_FOUND,
      )
    )

  schema_dict = template.parameters_schema if isinstance(template.parameters_schema, dict) else None
  query_str = interpolate_template_parameters(
    template.sql_template,
    parameters_schema=schema_dict,
    param_overrides=payload.parameters,
  )
  viz_type = provisioning_service._determine_visual_type(template)

  return Ok(
    TemplateInstantiateResponse(
      template_id=template.id,
      title=template.title,
      visualization=viz_type,
      query=query_str,
    )
  )


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
  res = await instantiate_template_result(template_id, payload, db)
  if isinstance(res, Err):
    raise HTTPException(status_code=res.error.status_code, detail=res.error.message)
  return res.value
