"""User model definition for authentication and ownership."""

import enum
import uuid
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.postgres import Base

if TYPE_CHECKING:
  from app.models.dashboard import Dashboard, DashboardShare


class Role(str, enum.Enum):
  """
  Granular hospital clinical and administrative role hierarchy.
  """

  SUPER_ADMIN = "SUPER_ADMIN"
  CHIEF_MEDICAL_OFFICER = "CHIEF_MEDICAL_OFFICER"
  DEPARTMENT_CHAIR = "DEPARTMENT_CHAIR"
  ATTENDING_PHYSICIAN = "ATTENDING_PHYSICIAN"
  CHARGE_NURSE = "CHARGE_NURSE"
  DATA_ANALYST = "DATA_ANALYST"


class User(Base):
  """
  SQLAlchemy model representing a system user.

  Attributes:
      id (UUID): Unique identifier for the user.
      email (str): Unique email address.
      hashed_password (str): Argon2/Bcrypt hashed password.
      is_active (bool): Flag indicating if the account is enabled.
      is_admin (bool): Flag indicating if the user has administrative privileges.
      role (str): Granular clinical RBAC role identifier.
      language_preference (str): User preferred UI language code.
      dashboards (List[Dashboard]): One-to-many relationship with Dashboards.
      dashboard_shares (List[DashboardShare]): One-to-many relationship with Dashboard shares.
  """

  __tablename__ = "users"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
  hashed_password: Mapped[str] = mapped_column(String, nullable=False)
  is_active: Mapped[bool] = mapped_column(Boolean, default=True)
  is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
  role: Mapped[str] = mapped_column(String, default=Role.DATA_ANALYST.value, nullable=False)
  language_preference: Mapped[str] = mapped_column(String, default="en", nullable=False)

  # Relationship: One-to-Many
  dashboards: Mapped[list["Dashboard"]] = relationship("app.models.dashboard.Dashboard", back_populates="owner")
  dashboard_shares: Mapped[list["DashboardShare"]] = relationship(
    "app.models.dashboard.DashboardShare", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
  )

  def __repr__(self) -> str:
    """Return distinct string representation of the User."""
    return f"<User {self.email}>"
