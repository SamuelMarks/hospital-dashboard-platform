"""
SQLAlchemy persistence models for the LLM + JAX + MPAX Hospital Operations Optimization Platform.

Stores:
1. `OptimizationSession`: Iterative clinical optimization sessions across Use Case 1
   (`service_unit`), Use Case 2 (`surgical_scheduling`), and Use Case 3 (`staffing_optimization`).
2. `OptimizationIteration`: Individual conversational turns, extracted mathematical constraints,
   MPAX solver outputs, and JAX Discrete Event Simulation (DES) expert baseline comparisons.
3. `OptimizationUserSurvey`: Structured qualitative and Likert-scale user experience evaluations
   comparing the self-service LLM-MPAX tool against manual graduate-student workflows and
   existing hospital workflow technologies.
"""

from __future__ import annotations

from datetime import datetime
import uuid

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.postgres import Base
from app.schemas.json_types import JsonObject


class OptimizationSession(Base):
  """
  Represents an iterative hospital optimization session owned by a clinical or operational leader.

  Attributes:
      id (uuid.UUID): Primary key UUID of the optimization session.
      user_id (uuid.UUID): Foreign key referencing `users.id`.
      use_case (str): Optimization use case identifier (`'service_unit'`, `'surgical_scheduling'`, or `'staffing_optimization'`).
      institution_id (str): Partner hospital institution profile identifier (e.g., `'stanford_childrens'`).
      title (str): Human-readable session title.
      active_constraints_json (JsonObject | None): Active mathematical optimization constraints dictionary.
      latest_solution_json (JsonObject | None): Latest deterministic JAX/MPAX solution payload.
      baseline_comparison_json (JsonObject | None): Latest JAX DES expert baseline comparison payload.
      created_at (datetime): Timestamp when the session was created.
      updated_at (datetime): Timestamp when the session was last updated.
      iterations (list[OptimizationIteration]): Ordered conversational solver iterations.
      surveys (list[OptimizationUserSurvey]): Submitted qualitative UX surveys linked to this session.
  """

  __tablename__ = "optimization_sessions"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  user_id: Mapped[uuid.UUID] = mapped_column(
    UUID(as_uuid=True),
    ForeignKey("users.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  use_case: Mapped[str] = mapped_column(String(50), nullable=False, default="service_unit")
  institution_id: Mapped[str] = mapped_column(String(64), nullable=False, default="stanford_childrens")
  title: Mapped[str] = mapped_column(String(200), nullable=False, default="Hospital Optimization Session")
  active_constraints_json: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
  latest_solution_json: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
  baseline_comparison_json: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
  created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    nullable=False,
  )
  updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    nullable=False,
  )

  iterations: Mapped[list[OptimizationIteration]] = relationship(
    "OptimizationIteration",
    back_populates="session",
    cascade="all, delete-orphan",
    order_by="OptimizationIteration.turn_index",
  )
  surveys: Mapped[list[OptimizationUserSurvey]] = relationship(
    "OptimizationUserSurvey",
    back_populates="session",
    cascade="all, delete-orphan",
  )

  def __repr__(self) -> str:
    """
    Returns a debugging string representation of the optimization session.

    Returns:
        str: Formatted representation including `id`, `use_case`, and `institution_id`.
    """
    return f"<OptimizationSession id={self.id} use_case={self.use_case} institution={self.institution_id}>"


class OptimizationIteration(Base):
  """
  Represents a single conversational or Quick-Action optimization turn within an `OptimizationSession`.

  Attributes:
      id (uuid.UUID): Primary key UUID of the iteration record.
      session_id (uuid.UUID): Foreign key referencing `optimization_sessions.id`.
      turn_index (int): 1-based sequential turn number within the session.
      user_prompt (str): Natural language instruction or Quick Action label submitted by the user.
      quick_action_id (str | None): Optional deterministic Quick Action identifier.
      model_id (str): Identifier of the LLM or LiteRT model used for constraint translation and interpretation.
      extracted_constraints_json (JsonObject | None): Structured constraint update extracted for MPAX.
      solver_output_json (JsonObject | None): Solved JAX/MPAX assignment or schedule payload.
      des_metrics_json (JsonObject | None): Quantitative JAX Discrete Event Simulation (DES) metrics.
      expert_baseline_gap (float): Relative percentage improvement or optimality gap vs. expert baseline.
      assistant_explanation (str): Interpretable clinical explanation generated for the decision maker.
      latency_ms (int): End-to-end execution latency in milliseconds.
      created_at (datetime): Timestamp when the iteration completed.
      session (OptimizationSession): Parent optimization session relationship.
  """

  __tablename__ = "optimization_iterations"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  session_id: Mapped[uuid.UUID] = mapped_column(
    UUID(as_uuid=True),
    ForeignKey("optimization_sessions.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  turn_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
  user_prompt: Mapped[str] = mapped_column(Text, nullable=False)
  quick_action_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
  model_id: Mapped[str] = mapped_column(String(120), nullable=False, default="gemini-2.5-pro")
  extracted_constraints_json: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
  solver_output_json: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
  des_metrics_json: Mapped[JsonObject | None] = mapped_column(JSONB, nullable=True)
  expert_baseline_gap: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
  assistant_explanation: Mapped[str] = mapped_column(Text, nullable=False)
  latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    nullable=False,
  )

  session: Mapped[OptimizationSession] = relationship("OptimizationSession", back_populates="iterations")

  def __repr__(self) -> str:
    """
    Returns a debugging string representation of the optimization iteration.

    Returns:
        str: Formatted representation including `id`, `turn_index`, and `model_id`.
    """
    return f"<OptimizationIteration id={self.id} turn={self.turn_index} model={self.model_id}>"


class OptimizationUserSurvey(Base):
  """
  Represents a qualitative and quantitative UX evaluation survey submitted by a hospital decision maker.

  Directly implements Metric 2 from `[Technical_addendum]_MPAX_PROJECT_PLAN.md`:
  comparing the self-service LLM-MPAX workflow against (A) the current manual graduate-student
  email process and (B) other hospital workflow technology (EHR/spreadsheets).

  Attributes:
      id (uuid.UUID): Primary key UUID of the survey record.
      user_id (uuid.UUID): Foreign key referencing `users.id`.
      session_id (uuid.UUID | None): Optional foreign key referencing `optimization_sessions.id`.
      use_case (str): Evaluated use case (`'service_unit'`, `'surgical_scheduling'`, or `'staffing_optimization'`).
      role_category (str): Clinical/operational role of respondent (e.g., `'Physician'`, `'Nurse Leader'`, `'Operations Executive'`).
      score_vs_manual_process (int): 1-5 rating comparing against the manual graduate-student email loop.
      score_vs_other_workflow_tech (int): 1-5 rating comparing against existing hospital workflow technology.
      interpretability_score (int): 1-5 rating of optimization result transparency and clinical interpretability.
      qualitative_feedback (str): Open-ended qualitative feedback narrative.
      created_at (datetime): Timestamp when the survey was submitted.
      session (OptimizationSession | None): Optional parent session relationship.
  """

  __tablename__ = "optimization_surveys"

  id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
  user_id: Mapped[uuid.UUID] = mapped_column(
    UUID(as_uuid=True),
    ForeignKey("users.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  session_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True),
    ForeignKey("optimization_sessions.id", ondelete="SET NULL"),
    nullable=True,
    index=True,
  )
  use_case: Mapped[str] = mapped_column(String(50), nullable=False)
  role_category: Mapped[str] = mapped_column(String(80), nullable=False, default="Physician")
  score_vs_manual_process: Mapped[int] = mapped_column(Integer, nullable=False)
  score_vs_other_workflow_tech: Mapped[int] = mapped_column(Integer, nullable=False)
  interpretability_score: Mapped[int] = mapped_column(Integer, nullable=False)
  qualitative_feedback: Mapped[str] = mapped_column(Text, nullable=False, default="")
  created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    server_default=func.now(),
    nullable=False,
  )

  session: Mapped[OptimizationSession | None] = relationship("OptimizationSession", back_populates="surveys")

  def __repr__(self) -> str:
    """
    Returns a debugging string representation of the user survey record.

    Returns:
        str: Formatted representation including `id`, `use_case`, and `score_vs_manual_process`.
    """
    return f"<OptimizationUserSurvey id={self.id} use_case={self.use_case} vs_manual={self.score_vs_manual_process}>"


__all__ = [
  "OptimizationIteration",
  "OptimizationSession",
  "OptimizationUserSurvey",
]
