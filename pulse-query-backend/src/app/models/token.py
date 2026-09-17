"""
SQLAlchemy model for persistent refresh tokens and session revocation.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.postgres import Base


class RefreshToken(Base):
  """
  Persisted record of an issued refresh token for session tracking and rotation.

  Attributes:
      id (UUID): Unique session record identifier.
      user_id (UUID): Associated user foreign key.
      token_hash (str): Hash or signature identifier of the refresh token.
      is_revoked (bool): Flag indicating if session has been revoked/rotated.
      expires_at (datetime): Token expiration boundary timestamp.
      created_at (datetime): Record creation timestamp.
  """

  __tablename__ = "refresh_tokens"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  user_id: Mapped[uuid.UUID] = mapped_column(
    UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
  )
  token_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
  is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
  expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

  user = relationship("app.models.user.User", lazy="selectin")

  def __repr__(self) -> str:
    """Return distinct string representation of the RefreshToken."""
    return f"<RefreshToken user_id={self.user_id} revoked={self.is_revoked}>"
