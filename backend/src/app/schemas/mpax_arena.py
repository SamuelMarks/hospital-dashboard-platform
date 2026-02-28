"""
Schemas for the MPAX vs LLM Arena integrations.
"""

from typing import Dict, List, Any, Optional
from pydantic import BaseModel


class MpaxArenaRequest(BaseModel):
  """
  Request payload for executing an MPAX vs LLM comparison.
  """

  prompt: str
  mode: str  # judge, translator, constraints, sql_vs_mpax, critic
  demand_sql: Optional[str] = (
    "SELECT Service, CurrentUnit as Unit, COUNT(*) as Count FROM hospital_data GROUP BY Service, CurrentUnit;"
  )
  base_capacity: Optional[Dict[str, int]] = None


class MpaxArenaCandidate(BaseModel):
  """
  Individual LLM candidate result in an MPAX Arena experiment.
  """

  id: str
  model_name: str
  content: str
  is_selected: bool = False
  mpax_result: Optional[Any] = None
  mpax_score: Optional[int] = None
  sql_snippet: Optional[str] = None


class MpaxArenaResponse(BaseModel):
  """
  Response returned after executing an MPAX Arena scenario.
  """

  experiment_id: str
  mode: str
  ground_truth_mpax: Optional[Any] = None
  candidates: List[MpaxArenaCandidate]
