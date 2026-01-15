import uuid
from typing import List
from sqlalchemy import String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.postgres import Base


class User(Base):
  """
  SQLAlchemy model representing a system user.

  Attributes:
      id (UUID): Unique identifier for the user.
      email (str): Unique email address.
      hashed_password (str): Argon2/Bcrypt hashed password.
      is_active (bool): Flag indicating if the account is enabled.
      dashboards (List[Dashboard]): One-to-many relationship with Dashboards.
  """

  __tablename__ = "users"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
  hashed_password: Mapped[str] = mapped_column(String, nullable=False)
  is_active: Mapped[bool] = mapped_column(Boolean, default=True)

  # Relationship: One-to-Many
  dashboards: Mapped[List["Dashboard"]] = relationship("app.models.dashboard.Dashboard", back_populates="owner")

  def __repr__(self) -> str:
    """Return distinct string representation of the User."""
    return f"<User {self.email}>"
