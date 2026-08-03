"""
Feedback Domain Schemas.

Defines the Data Transfer Objects (DTOs) for logging benchmark data.
These schemas allow the frontend to report user selections ("Wins") and
receive anonymized model candidates associated with an experiment.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ModelCandidateBase(BaseModel):
  """
  Shared properties for a model response candidate.
  """

  model_tag: str
  generated_sql: str
  sql_hash: str | None = None
  latency_ms: int | None = None


class ModelCandidateCreate(ModelCandidateBase):
  """
  Schema for creating a candidate entry in the DB (Internal use by AI Service).
  Includes the actual model identifier which is masked in the response.
  """

  model_identifier: str
  execution_success: bool | None = None
  error_message: str | None = None


class ModelCandidateResponse(ModelCandidateBase):
  """
  Public response schema for the frontend.
  Hides 'model_identifier' to maintain double-blind benchmarking.
  """

  id: UUID
  experiment_id: UUID
  # is_selected is initially False
  is_selected: bool

  model_config = ConfigDict(from_attributes=True)


class FeedbackUpdate(BaseModel):
  """
  Payload for the frontend to report a user's choice.
  """

  is_selected: bool = True


class ExperimentBase(BaseModel):
  """
  Shared properties for an AI experiment/prompt.
  """

  prompt_text: str
  prompt_strategy: str | None = "default"


class ExperimentCreate(ExperimentBase):
  """
  Schema for initiating a new experiment log.
  """


class ExperimentResponse(ExperimentBase):
  """
  Return schema containing the UUID and list of anonymous candidates.
  """

  id: UUID
  user_id: UUID
  created_at: datetime
  candidates: list[ModelCandidateResponse] = []

  model_config = ConfigDict(from_attributes=True)
