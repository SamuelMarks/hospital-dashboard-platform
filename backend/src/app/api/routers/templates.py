"""
Templates API Router.

This module exposes the CRUD endpoints for managing the Widget Template Registry.
Updated to support server-side searching and limiting to efficiently handle
large catalogs of analytics questions.
"""

from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.database.postgres import get_db
from app.models.template import WidgetTemplate
from app.models.user import User
from app.schemas.template import TemplateCreate, TemplateResponse, TemplateUpdate

router = APIRouter()


@router.get("/", response_model=List[TemplateResponse])
async def list_templates(
  db: Annotated[AsyncSession, Depends(get_db)],
  category: Annotated[Optional[str], Query(description="Filter templates by category")] = None,
  search: Annotated[Optional[str], Query(description="Search title or description")] = None,
  limit: Annotated[int, Query(description="Max records to return", ge=1, le=100)] = 30,
  current_user: User = Depends(deps.get_current_user),
) -> List[WidgetTemplate]:
  """
  Retrieve a list of available widget templates with filtering and pagination.
  """
  query = select(WidgetTemplate)

  # Apply Category Filter
  if category:
    query = query.where(WidgetTemplate.category == category)

  # Apply Text Search (Case Insensitive ILIKE)
  if search:
    search_term = f"%{search}%"
    query = query.where(
      or_(
        WidgetTemplate.title.ilike(search_term),
        WidgetTemplate.description.ilike(search_term),
      )
    )

  # Apply Limit / Sort
  query = query.order_by(WidgetTemplate.title).limit(limit)

  result = await db.execute(query)
  return result.scalars().all()


@router.post("/", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
  template_in: TemplateCreate,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: User = Depends(deps.get_current_user),
) -> WidgetTemplate:
  """
  Register a new analytics template in the system.
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
  await db.refresh(template)
  return template


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
  template_id: UUID,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: User = Depends(deps.get_current_user),
) -> WidgetTemplate:
  """
  Retrieve details for a specific template.
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
  """
  result = await db.execute(select(WidgetTemplate).where(WidgetTemplate.id == template_id))
  template = result.scalars().first()
  if not template:
    raise HTTPException(status_code=404, detail="Template not found")

  update_data = template_in.model_dump(exclude_unset=True)

  for key, value in update_data.items():
    setattr(template, key, value)

  await db.commit()
  await db.refresh(template)
  return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
  template_id: UUID,
  db: Annotated[AsyncSession, Depends(get_db)],
  current_user: User = Depends(deps.get_current_user),
) -> None:
  """
  Hard delete a template from the registry.
  """
  result = await db.execute(select(WidgetTemplate).where(WidgetTemplate.id == template_id))
  template = result.scalars().first()
  if not template:
    raise HTTPException(status_code=404, detail="Template not found")

  await db.delete(template)
  await db.commit()
  return None
