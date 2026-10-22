"""
Clinical Alert Rules Domain Service Module.

Encapsulates CRUD operations for hospital bed occupancy and capacity alerting
thresholds using explicit `AppResult[T]` return values.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.models.alert_rule import AlertRule
from app.schemas.alert_rule import AlertRuleCreate, AlertRuleUpdate


class AlertRulesService:
  """
  Domain service managing clinical alert rule persistence and lookup.
  """

  async def list_alert_rules_result(
    self,
    db: AsyncSession,
  ) -> AppResult[list[AlertRule]]:
    """
    Lists all configured clinical alert rules ordered by unit category.

    Args:
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[list[AlertRule]]: `Ok(list[AlertRule])` containing all rules.
    """
    result = await db.execute(select(AlertRule).order_by(AlertRule.unit_category))
    return Ok(list(result.scalars().all()))

  async def create_alert_rule_result(
    self,
    request: AlertRuleCreate,
    db: AsyncSession,
  ) -> AppResult[AlertRule]:
    """
    Creates and persists a new clinical alert rule.

    Args:
        request (AlertRuleCreate): Creation payload with category, threshold, and severity.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[AlertRule]: `Ok(AlertRule)` wrapping the persisted rule.
    """
    rule = AlertRule(
      unit_category=request.unit_category,
      threshold_percentage=request.threshold_percentage,
      severity=request.severity.value,
      is_active=request.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return Ok(rule)

  async def get_alert_rule_result(
    self,
    rule_id: UUID,
    db: AsyncSession,
  ) -> AppResult[AlertRule]:
    """
    Retrieves a single clinical alert rule by UUID.

    Args:
        rule_id (UUID): Unique alert rule identifier.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[AlertRule]: `Ok(AlertRule)` if found, or `Err(AppError)` with `ALERT_RULE_NOT_FOUND`.
    """
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalars().first()
    if not rule:
      return Err(
        AppError(
          code=ErrorCode.ALERT_RULE_NOT_FOUND,
          message="Alert rule not found",
          status_code=status.HTTP_404_NOT_FOUND,
        )
      )
    return Ok(rule)

  async def update_alert_rule_result(
    self,
    rule_id: UUID,
    request: AlertRuleUpdate,
    db: AsyncSession,
  ) -> AppResult[AlertRule]:
    """
    Updates an existing clinical alert rule with partial attribute modifications.

    Args:
        rule_id (UUID): Unique alert rule identifier.
        request (AlertRuleUpdate): Partial attribute update payload.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[AlertRule]: `Ok(AlertRule)` if updated, or `Err(AppError)` with `ALERT_RULE_NOT_FOUND`.
    """
    rule_res = await self.get_alert_rule_result(rule_id, db)
    if isinstance(rule_res, Err):
      return rule_res

    rule = rule_res.value
    if request.unit_category is not None:
      rule.unit_category = request.unit_category
    if request.threshold_percentage is not None:
      rule.threshold_percentage = request.threshold_percentage
    if request.severity is not None:
      rule.severity = request.severity.value
    if request.is_active is not None:
      rule.is_active = request.is_active

    await db.commit()
    await db.refresh(rule)
    return Ok(rule)

  async def delete_alert_rule_result(
    self,
    rule_id: UUID,
    db: AsyncSession,
  ) -> AppResult[None]:
    """
    Deletes an existing clinical alert rule by UUID.

    Args:
        rule_id (UUID): Unique alert rule identifier.
        db (AsyncSession): Active PostgreSQL async session.

    Returns:
        AppResult[None]: `Ok(None)` if deleted, or `Err(AppError)` with `ALERT_RULE_NOT_FOUND`.
    """
    rule_res = await self.get_alert_rule_result(rule_id, db)
    if isinstance(rule_res, Err):
      return rule_res

    await db.delete(rule_res.value)
    await db.commit()
    return Ok(None)


alert_rules_service = AlertRulesService()
