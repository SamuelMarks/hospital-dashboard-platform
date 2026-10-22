"""
Widget Template Database Model.

Defines the SQL Alchemy ORM structure for storing analytics templates.
This table acts as the registry for reusable business questions (e.g., 'Predictive Availability').
"""

from typing import Any
import uuid

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.postgres import Base


class WidgetTemplate(Base):
  """
  SQLAlchemy model representing a reusable analytics template.

  Attributes:
      id (UUID): Unique identifier for the template.
      title (str): The display name of the question (e.g., "Bottleneck Analysis").
      description (str | None): A verbose explanation of what this analytic answers.
      sql_template (str): The raw DuckDB SQL query containing {{handlebar}} variables.
      category (str): Grouping tag (e.g., "Predictive Availability", "Throughput").
      parameters_schema (dict[str, Any]): A JSON object defining the expected inputs.
  """

  __tablename__ = "widget_templates"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  title: Mapped[str] = mapped_column(String, index=True, nullable=False)
  description: Mapped[str | None] = mapped_column(Text, nullable=True)
  sql_template: Mapped[str] = mapped_column(Text, nullable=False)
  category: Mapped[str] = mapped_column(String, index=True, nullable=False)
  parameters_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

  def __repr__(self) -> str:
    """Return distinct string representation of the Template."""
    return f"<WidgetTemplate {self.title}>"
