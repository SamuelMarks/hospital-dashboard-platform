"""
Clinical Alert Rules API Router.

Provides CRUD endpoints for hospital administrators and data analysts
to configure real-time bed capacity and occupancy alerting thresholds
by delegating to `AlertRulesService`.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.result import unwrap_or_raise_http
from app.database.postgres import get_db
from app.models.alert_rule import AlertRule
from app.models.user import User
from app.schemas.alert_rule import AlertRuleCreate, AlertRuleResponse, AlertRuleUpdate
from app.services.alert_rules_service import alert_rules_service

router = APIRouter()


@router.get("", response_model=list[AlertRuleResponse])
@router.get("/", response_model=list[AlertRuleResponse])
async def list_alert_rules(
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AlertRule]:
  """
  Lists all configured hospital capacity alert rules.

  Args:
      current_user (User): Authenticated requesting user.
      db (AsyncSession): PostgreSQL async database session.

  Returns:
      list[AlertRule]: List of active and inactive alert rules.
  """
  _ = current_user
  res = await alert_rules_service.list_alert_rules_result(db)
  return unwrap_or_raise_http(res)


@router.post("", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(
  request: AlertRuleCreate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> AlertRule:
  """
  Creates a new clinical alert rule with configured unit and occupancy threshold.

  Args:
      request (AlertRuleCreate): Creation payload with category, threshold, and severity.
      current_user (User): Authenticated user.
      db (AsyncSession): PostgreSQL async database session.

  Returns:
      AlertRule: The newly created and persisted alert rule.
  """
  _ = current_user
  res = await alert_rules_service.create_alert_rule_result(request, db)
  return unwrap_or_raise_http(res)


@router.get("/{rule_id}", response_model=AlertRuleResponse)
async def get_alert_rule(
  rule_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> AlertRule:
  """
  Retrieves a single clinical alert rule by its UUID.

  Args:
      rule_id (UUID): Unique alert rule identifier.
      current_user (User): Authenticated user.
      db (AsyncSession): PostgreSQL async database session.

  Returns:
      AlertRule: The requested alert rule entity.

  Raises:
      HTTPException: 404 if the rule does not exist.
  """
  _ = current_user
  res = await alert_rules_service.get_alert_rule_result(rule_id, db)
  return unwrap_or_raise_http(res)


@router.put("/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
  rule_id: UUID,
  request: AlertRuleUpdate,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> AlertRule:
  """
  Updates an existing clinical alert rule with partial attribute modifications.

  Args:
      rule_id (UUID): Unique alert rule identifier.
      request (AlertRuleUpdate): Attributes to update.
      current_user (User): Authenticated user.
      db (AsyncSession): PostgreSQL async database session.

  Returns:
      AlertRule: The updated alert rule entity.

  Raises:
      HTTPException: 404 if the rule does not exist.
  """
  _ = current_user
  res = await alert_rules_service.update_alert_rule_result(rule_id, request, db)
  return unwrap_or_raise_http(res)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(
  rule_id: UUID,
  current_user: Annotated[User, Depends(deps.get_current_user)],
  db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
  """
  Deletes an existing clinical alert rule by UUID.

  Args:
      rule_id (UUID): Unique alert rule identifier to remove.
      current_user (User): Authenticated user.
      db (AsyncSession): PostgreSQL async database session.

  Raises:
      HTTPException: 404 if the rule does not exist.
  """
  _ = current_user
  res = await alert_rules_service.delete_alert_rule_result(rule_id, db)
  unwrap_or_raise_http(res)
