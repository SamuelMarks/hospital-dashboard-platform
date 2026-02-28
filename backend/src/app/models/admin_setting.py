"""Admin configuration settings."""

from typing import Any
import uuid
from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database.postgres import Base


class AdminSetting(Base):
  """
  SQLAlchemy model representing a system-wide setting.
  """

  __tablename__ = "admin_settings"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  setting_key: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
  setting_value: Mapped[Any] = mapped_column(JSONB, nullable=True)

  def __repr__(self) -> str:
    """Return distinct string representation."""
    return f"<AdminSetting {self.setting_key}>"
