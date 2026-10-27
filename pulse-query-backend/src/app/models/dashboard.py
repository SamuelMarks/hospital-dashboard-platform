"""Dashboard and widget models for the analytics UI."""

from typing import TYPE_CHECKING
import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.postgres import Base
from app.schemas.json_types import JsonObject

if TYPE_CHECKING:
  from app.models.user import User


class Dashboard(Base):
  """SQLAlchemy model representing a user dashboard."""

  __tablename__ = "dashboards"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  name: Mapped[str] = mapped_column(String, index=True)
  owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
  permission_level: str = "OWNER"

  # Relationships
  owner: Mapped["User"] = relationship("app.models.user.User", back_populates="dashboards")

  # Cascade delete: if dashboard is deleted, delete its widgets
  widgets: Mapped[list["Widget"]] = relationship(
    back_populates="dashboard", cascade="all, delete-orphan", lazy="selectin"
  )

  # Cascade delete: if dashboard is deleted, delete its shares
  shares: Mapped[list["DashboardShare"]] = relationship(
    back_populates="dashboard", cascade="all, delete-orphan", lazy="selectin"
  )


class DashboardShare(Base):
  """SQLAlchemy model representing a multi-user share on a dashboard."""

  __tablename__ = "dashboard_shares"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  dashboard_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
  user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
  permission_level: Mapped[str] = mapped_column(String, default="VIEW")  # "VIEW" or "EDIT"

  # Relationships
  dashboard: Mapped["Dashboard"] = relationship("Dashboard", back_populates="shares")
  user: Mapped["User"] = relationship("app.models.user.User", back_populates="dashboard_shares")


class Widget(Base):
  """SQLAlchemy model representing a dashboard widget."""

  __tablename__ = "widgets"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  dashboard_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("dashboards.id"))

  title: Mapped[str] = mapped_column(String)

  # widget type: "SQL" or "HTTP"
  type: Mapped[str] = mapped_column(String)

  # visualization: "table", "metric", "bar_chart"
  visualization: Mapped[str] = mapped_column(String, default="table")

  # config:
  # For SQL: { "query": "SELECT * ..." }
  # For HTTP: { "url": "https://api...", "method": "GET" }
  # Also stores Layout: { "w": 6, "h": 4, "x": 0, "y": 0 }
  config: Mapped[JsonObject] = mapped_column(JSONB, default=dict)

  dashboard: Mapped["Dashboard"] = relationship("Dashboard", back_populates="widgets")
