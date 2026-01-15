import uuid
from typing import List, Dict, Any, Optional
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.postgres import Base

# Avoid circular import issues by using string references for relationships if needed,
# but since we import Base, we rely on SQLAlchemy registry.


class Dashboard(Base):
  __tablename__ = "dashboards"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  name: Mapped[str] = mapped_column(String, index=True)
  owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))

  # Relationships
  owner = relationship("app.models.user.User", back_populates="dashboards")

  # Cascade delete: if dashboard is deleted, delete its widgets
  widgets: Mapped[List["Widget"]] = relationship(
    back_populates="dashboard", cascade="all, delete-orphan", lazy="selectin"
  )


class Widget(Base):
  __tablename__ = "widgets"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  dashboard_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("dashboards.id"))

  title: Mapped[str] = mapped_column(String)

  # type: "SQL" or "HTTP"
  type: Mapped[str] = mapped_column(String)

  # visualization: "table", "metric", "bar_chart"
  visualization: Mapped[str] = mapped_column(String, default="table")

  # config:
  # For SQL: { "query": "SELECT * ..." }
  # For HTTP: { "url": "https://api...", "method": "GET" }
  # Also stores Layout: { "w": 6, "h": 4, "x": 0, "y": 0 }
  config: Mapped[Dict[str, Any]] = mapped_column(JSONB, default={})

  dashboard = relationship("Dashboard", back_populates="widgets")
