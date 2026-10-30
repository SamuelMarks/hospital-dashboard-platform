"""SQLAlchemy ORM models package."""

from app.database.postgres import Base
from app.models.admin_setting import AdminSetting
from app.models.alert_rule import AlertRule, AlertSeverity
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.dashboard import Dashboard, DashboardShare, Widget
from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.optimization import (
  OptimizationIteration,
  OptimizationSession,
  OptimizationUserSurvey,
)
from app.models.template import WidgetTemplate
from app.models.token import RefreshToken
from app.models.user import Role, User, UserRole

ORM_MODEL_CLASSES: tuple[type[Base], ...] = (
  AdminSetting,
  AlertRule,
  Conversation,
  Dashboard,
  DashboardShare,
  ExperimentLog,
  Message,
  MessageCandidate,
  ModelCandidate,
  OptimizationIteration,
  OptimizationSession,
  OptimizationUserSurvey,
  RefreshToken,
  User,
  Widget,
  WidgetTemplate,
)


def register_orm_models() -> tuple[type[Base], ...]:
  """
  Returns the tuple of all declarative SQLAlchemy ORM model classes registered on `Base.metadata`.

  Returns:
      tuple[type[Base], ...]: Registered ORM model classes.
  """
  return ORM_MODEL_CLASSES


__all__ = [
  "ORM_MODEL_CLASSES",
  "AdminSetting",
  "AlertRule",
  "AlertSeverity",
  "Conversation",
  "Dashboard",
  "DashboardShare",
  "ExperimentLog",
  "Message",
  "MessageCandidate",
  "ModelCandidate",
  "OptimizationIteration",
  "OptimizationSession",
  "OptimizationUserSurvey",
  "RefreshToken",
  "Role",
  "User",
  "UserRole",
  "Widget",
  "WidgetTemplate",
  "register_orm_models",
]
