"""AlertRule and Capacity Alert database models."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.postgres import Base


class AlertSeverity(str, enum.Enum):
  """Severity classification for bed occupancy alerts."""

  INFO = "INFO"
  WARNING = "WARNING"
  CRITICAL = "CRITICAL"


class AlertRule(Base):
  """
  SQLAlchemy model defining a bed occupancy alert rule.

  Attributes:
      id (UUID): Unique rule identifier.
      unit_category (str): Target hospital unit category (e.g., 'Critical Care', 'General').
      threshold_percentage (float): Bed occupancy percentage threshold to trigger alert.
      severity (str): Alert severity level ('INFO', 'WARNING', 'CRITICAL').
      is_active (bool): Whether the alert rule is actively evaluated.
      created_at (datetime): Timestamp when the rule was created.
  """

  __tablename__ = "alert_rules"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  unit_category: Mapped[str] = mapped_column(String, nullable=False, index=True)
  threshold_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=90.0)
  severity: Mapped[str] = mapped_column(String, nullable=False, default=AlertSeverity.WARNING.value)
  is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

  def __repr__(self) -> str:
    """Return distinct string representation of AlertRule."""
    return f"<AlertRule {self.unit_category} >= {self.threshold_percentage}% [{self.severity}]>"
