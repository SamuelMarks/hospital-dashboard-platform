"""
Widget Template Registry Domain Service Module.

Encapsulates CRUD operations and SQL parameter instantiation for `WidgetTemplate`
entities using explicit `AppResult[T]` return values.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.template import WidgetTemplate
from app.schemas.template import (
  TemplateCreate,
  TemplateInstantiateRequest,
  TemplateInstantiateResponse,
  TemplateUpdate,
)
from app.services.provisioning import provisioning_service
from app.services.sql_utils import interpolate_template_parameters


class TemplateService:
  """
  Domain service managing widget templates and parameterized SQL instantiation.
  """

  async def list_templates_result(
    self,
    db: AsyncSession,
    category: str | None = None,
    search: str | None = None,
    limit: int = 30,
  ) -> AppResult[list[WidgetTemplate]]:
    """
    Retrieves widget templates filtered by optional category and search term.

    Args:
        db (AsyncSession): Active PostgreSQL async session.
        category (str | None): Optional category filter.
        search (str | None): Optional case-insensitive search substring for title/description.
        limit (int): Maximum number of records to return.

    Returns:
        AppResult[list[WidgetTemplate]]: `Ok(list[WidgetTemplate])` containing matching templates.
    """
    query = select(WidgetTemplate)

    if category:
      query = query.where(WidgetTemplate.category == category)

    if search:
      term = search.strip()
      pattern = f"%{term}%"
      query = query.where(
        or_(
          WidgetTemplate.title.ilike(pattern),
          WidgetTemplate.description.ilike(pattern),
        )
      )

    query = query.order_by(WidgetTemplate.title).limit(limit)
    result = await db.execute(query)
    return Ok(list(result.scalars().all()))

  async def create_template_result(
    self,
    template_in: TemplateCreate,
    db: AsyncSession,
  ) -> AppResult[WidgetTemplate]:
    """
    Creates and persists a new widget template in the registry.

    Args:
        template_in (TemplateCreate): Validated template creation payload.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[WidgetTemplate]: `Ok(WidgetTemplate)` wrapping the persisted template.
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
    return Ok(template)

  async def get_template_result(
    self,
    template_id: UUID,
    db: AsyncSession,
  ) -> AppResult[WidgetTemplate]:
    """
    Retrieves a single widget template by UUID.

    Args:
        template_id (UUID): Unique template identifier.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[WidgetTemplate]: `Ok(WidgetTemplate)` if found, or `Err(AppError)` with `RESOURCE_NOT_FOUND`.
    """
    result = await db.execute(select(WidgetTemplate).where(WidgetTemplate.id == template_id))
    template = result.scalars().first()
    if not template:
      return Err(
        AppError(
          code=ErrorCode.RESOURCE_NOT_FOUND,
          message="Template not found",
          status_code=404,
        )
      )
    return Ok(template)

  async def update_template_result(
    self,
    template_id: UUID,
    template_in: TemplateUpdate,
    db: AsyncSession,
  ) -> AppResult[WidgetTemplate]:
    """
    Updates an existing widget template with partial fields.

    Args:
        template_id (UUID): Unique template identifier.
        template_in (TemplateUpdate): Partial template update payload.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[WidgetTemplate]: `Ok(WidgetTemplate)` if updated, or `Err(AppError)` with `RESOURCE_NOT_FOUND`.
    """
    tpl_res = await self.get_template_result(template_id, db)
    if isinstance(tpl_res, Err):
      return tpl_res

    template = tpl_res.value
    if template_in.title is not None:
      template.title = template_in.title
    if template_in.description is not None:
      template.description = template_in.description
    if template_in.sql_template is not None:
      template.sql_template = template_in.sql_template
    if template_in.category is not None:
      template.category = template_in.category
    if template_in.parameters_schema is not None:
      template.parameters_schema = template_in.parameters_schema

    await db.commit()
    return Ok(template)

  async def delete_template_result(
    self,
    template_id: UUID,
    db: AsyncSession,
  ) -> AppResult[None]:
    """
    Deletes a widget template from the registry by UUID.

    Args:
        template_id (UUID): Unique template identifier.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[None]: `Ok(None)` if deleted, or `Err(AppError)` with `RESOURCE_NOT_FOUND`.
    """
    tpl_res = await self.get_template_result(template_id, db)
    if isinstance(tpl_res, Err):
      return tpl_res

    await db.delete(tpl_res.value)
    await db.commit()
    return Ok(None)

  async def instantiate_template_result(
    self,
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
    tpl_res = await self.get_template_result(template_id, db)
    if isinstance(tpl_res, Err):
      return tpl_res

    template = tpl_res.value
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


template_service = TemplateService()
