"""
Widget Template Database Model.

Defines the SQL Alchemy ORM structure for storing analytics templates.
This table acts as the registry for reusable business questions (e.g., 'Predictive Availability').
"""

import uuid
from typing import Dict, Any, List
from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database.postgres import Base


class WidgetTemplate(Base):
  """
  SQLAlchemy model representing a reusable analytics template.

  Attributes:
      id (UUID): Unique identifier for the template.
      title (str): The display name of the question (e.g., "Bottleneck Analysis").
      description (str): A verbose explanation of what this analytic answers.
      sql_template (str): The raw DuckDB SQL query containing {{handlebar}} variables.
      category (str): Grouping tag (e.g., "Predictive Availability", "Throughput").
      parameters_schema (Dict[str, Any]): A JSON object defining the expected inputs.
          This schema drives the frontend dynamic form.
  """

  __tablename__ = "widget_templates"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  title: Mapped[str] = mapped_column(String, index=True, nullable=False)
  description: Mapped[str] = mapped_column(Text, nullable=True)
  sql_template: Mapped[str] = mapped_column(Text, nullable=False)
  category: Mapped[str] = mapped_column(String, index=True, nullable=False)

  # Stores configuration for dynamic frontend forms (selects, inputs, datepickers)
  # Changed from List to Dict to match standard JSON Schema root object
  parameters_schema: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)

  def __repr__(self) -> str:
    """Return distinct string representation of the Template."""
    return f"<WidgetTemplate {self.title}>"
