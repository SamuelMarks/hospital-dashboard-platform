"""
SQLAlchemy persistence models for MPAX Arena runs and candidate voting.
"""

from datetime import datetime
from typing import Any
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.postgres import Base


class MpaxArenaRun(Base):
  """
  Represents an evaluated MPAX vs LLM scenario experiment.

  Attributes:
      id (uuid.UUID): Unique identifier for the arena run.
      user_id (uuid.UUID): Foreign key referencing the user who initiated the run.
      prompt (str): Clinical question or scenario prompt.
      mode (str): Evaluation mode (judge, translator, constraints, sql_vs_mpax, critic).
      ground_truth_mpax (dict | None): Optional ground-truth solver output artifact.
      created_at (datetime): Timestamp when the scenario was executed.
      candidates (list[MpaxArenaCandidateRecord]): Candidate evaluation records.
  """

  __tablename__ = "mpax_arena_runs"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
  prompt: Mapped[str] = mapped_column(Text, nullable=False)
  mode: Mapped[str] = mapped_column(String(50), nullable=False)
  ground_truth_mpax: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

  candidates: Mapped[list["MpaxArenaCandidateRecord"]] = relationship(
    "MpaxArenaCandidateRecord",
    back_populates="run",
    cascade="all, delete-orphan",
    lazy="selectin",
  )

  def __repr__(self) -> str:
    """Returns a debugging string representation of the arena run."""
    return f"<MpaxArenaRun id={self.id} mode={self.mode}>"


class MpaxArenaCandidateRecord(Base):
  """
  Represents a single model's response and user voting state in an MPAX run.

  Attributes:
      id (uuid.UUID): Unique identifier for this candidate output.
      run_id (uuid.UUID): Foreign key referencing the parent MpaxArenaRun.
      model_name (str): Identifier of the generating LLM.
      content (str): Complete response text from the model.
      sql_snippet (str | None): Extracted SQL code block if available.
      mpax_score (int | None): Mathematical solver feasibility score.
      mpax_result (dict | None): Serialized solver allocation payload.
      is_winner (bool): Flag indicating whether user voted for this candidate.
      run (MpaxArenaRun): Parent arena run entity.
  """

  __tablename__ = "mpax_arena_candidates"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  run_id: Mapped[uuid.UUID] = mapped_column(
    ForeignKey("mpax_arena_runs.id", ondelete="CASCADE"), nullable=False, index=True
  )
  model_name: Mapped[str] = mapped_column(String(100), nullable=False)
  content: Mapped[str] = mapped_column(Text, nullable=False)
  sql_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
  mpax_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
  mpax_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
  is_winner: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

  run: Mapped["MpaxArenaRun"] = relationship("MpaxArenaRun", back_populates="candidates")

  def __repr__(self) -> str:
    """Returns a debugging string representation of the candidate record."""
    return f"<MpaxArenaCandidateRecord id={self.id} model={self.model_name} is_winner={self.is_winner}>"
