"""
Composable Natural-Language and JSON Constraint Parser Module for Hospital Optimization.

Decomposes natural-language clinical instructions and LLM JSON responses into
strongly typed mathematical optimization constraints for:
- Use Case 1 (`ServiceUnitConstraint`): Bed capacity deltas, service locks, prohibitions, and minimum bed reserves.
- Use Case 2 (`SurgicalScheduleConstraint`): BEDS & POINTS post-op admission caps, emergency bed reserves, and day prohibitions.
- Use Case 3 (`StaffingConstraint`): Unexpected RN overtime caps, Administrative Day (A-day) limits, and float pool caps.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import TypeAdapter, ValidationError

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.optimization import (
  InstitutionProfileSchema,
  OptimizationUseCase,
  ServiceUnitConstraint,
  StaffingConstraint,
  SurgicalScheduleConstraint,
)

_SERVICE_CONSTRAINTS_ADAPTER: TypeAdapter[list[ServiceUnitConstraint]] = TypeAdapter(list[ServiceUnitConstraint])
_SURGICAL_CONSTRAINTS_ADAPTER: TypeAdapter[list[SurgicalScheduleConstraint]] = TypeAdapter(
  list[SurgicalScheduleConstraint]
)
_STAFFING_CONSTRAINTS_ADAPTER: TypeAdapter[list[StaffingConstraint]] = TypeAdapter(list[StaffingConstraint])


def match_clinical_service(lower_text: str, services: list[str]) -> str | None:
  """
  Matches a clinical service name or clinical abbreviation (`gen peds`, `neuro`, `cardio`, `onc`) in `lower_text`.

  Args:
      lower_text (str): Lowercased user prompt.
      services (list[str]): Institution clinical service names.

  Returns:
      str | None: Canonical clinical service name if matched, otherwise None.
  """
  service_aliases: dict[str, str] = {}
  for svc in services:
    svc_low = svc.lower()
    service_aliases[svc_low] = svc
    if "pediatric" in svc_low:
      service_aliases["gen peds"] = svc
      service_aliases["general peds"] = svc
    elif "neuro" in svc_low:
      service_aliases["neuro"] = svc
    elif "cardio" in svc_low:
      service_aliases["cardio"] = svc
    elif "oncol" in svc_low:
      service_aliases["onc"] = svc

  for alias, canonical_svc in sorted(service_aliases.items(), key=lambda kv: len(kv[0]), reverse=True):
    if alias in lower_text:
      return canonical_svc
  return None


def _extract_bed_capacity_delta_rules(
  lower_text: str,
  matched_units: list[str],
  primary_unit: str,
  secondary_unit: str,
) -> list[ServiceUnitConstraint]:
  """
  Extracts bed expansion (`open`/`add`) and bed closure (`close`/`remove`) rules from `lower_text`.

  Args:
      lower_text (str): Lowercased user prompt.
      matched_units (list[str]): Matched hospital unit names in appearance order.
      primary_unit (str): Primary target unit name.
      secondary_unit (str): Secondary target unit name when multiple units are referenced.

  Returns:
      list[ServiceUnitConstraint]: Extracted capacity delta constraints.
  """
  rules: list[ServiceUnitConstraint] = []
  add_match = re.search(
    r"(?:open|add|expand|increase|additional)[^0-9]*?(\d+(?:\.\d+)?)\s*(?:additional\s+)?beds?",
    lower_text,
  )
  if add_match:
    bed_delta = float(add_match.group(1))
    cap_unit = secondary_unit if ("place all" in lower_text and len(matched_units) > 1) else primary_unit
    rules.append(
      ServiceUnitConstraint(
        constraint_type="unit_capacity_delta",
        unit=cap_unit,
        value=bed_delta,
        rationale=f"Add {bed_delta:g} beds on {cap_unit} per natural-language request.",
      )
    )

  close_match = re.search(r"(?:close|remove|reduce)[^0-9]*?(\d+(?:\.\d+)?)\s*beds?", lower_text)
  if close_match:
    bed_reduction = -float(close_match.group(1))
    rules.append(
      ServiceUnitConstraint(
        constraint_type="unit_capacity_delta",
        unit=primary_unit,
        value=bed_reduction,
        rationale=f"Reduce {abs(bed_reduction):g} beds on {primary_unit} per natural-language request.",
      )
    )
  return rules


def _extract_service_placement_rules(
  lower_text: str,
  matched_service: str,
  primary_unit: str,
) -> list[ServiceUnitConstraint]:
  """
  Extracts service-to-unit lock, prohibition, and minimum bed reservation rules for `matched_service`.

  Args:
      lower_text (str): Lowercased user prompt.
      matched_service (str): Canonical clinical service name.
      primary_unit (str): Target hospital unit name.

  Returns:
      list[ServiceUnitConstraint]: Extracted service placement constraints.
  """
  rules: list[ServiceUnitConstraint] = []
  if any(k in lower_text for k in ("place all", "lock", "assign all")):
    rules.append(
      ServiceUnitConstraint(
        constraint_type="lock_service_to_unit",
        service=matched_service,
        unit=primary_unit,
        value=1.0,
        rationale=f"Lock {matched_service} exclusively to {primary_unit}.",
      )
    )
  if any(k in lower_text for k in ("prohibit", "do not place", "exclude")):
    rules.append(
      ServiceUnitConstraint(
        constraint_type="prohibit_service_on_unit",
        service=matched_service,
        unit=primary_unit,
        value=0.0,
        rationale=f"Prohibit {matched_service} placements on {primary_unit}.",
      )
    )
  min_match = re.search(r"(?:at least|minimum|reserve)\s+(\d+(?:\.\d+)?)\s*beds?", lower_text)
  if min_match:
    min_beds = float(min_match.group(1))
    rules.append(
      ServiceUnitConstraint(
        constraint_type="min_service_beds",
        service=matched_service,
        unit=primary_unit,
        value=min_beds,
        rationale=f"Reserve at least {min_beds:g} beds for {matched_service} on {primary_unit}.",
      )
    )
  return rules


def extract_service_unit_constraints_from_prompt(
  prompt: str,
  profile: InstitutionProfileSchema,
) -> list[ServiceUnitConstraint]:
  """
  Extracts Use Case 1 (`ServiceUnitConstraint`) mathematical rules from a natural-language prompt.

  Args:
      prompt (str): Natural language request from the hospital leader.
      profile (InstitutionProfileSchema): Active institution profile for matching service/unit names.

  Returns:
      list[ServiceUnitConstraint]: Extracted mathematical constraints.
  """
  lower_text = prompt.strip().lower()
  if not lower_text:
    return []

  matched_service = match_clinical_service(lower_text, profile.clinical_services)
  matched_units = [u for u in profile.unit_capacities if u.lower() in lower_text]
  primary_unit = matched_units[0] if matched_units else next(iter(profile.unit_capacities.keys()))
  secondary_unit = matched_units[1] if len(matched_units) > 1 else primary_unit

  extracted = _extract_bed_capacity_delta_rules(lower_text, matched_units, primary_unit, secondary_unit)
  if matched_service:
    extracted.extend(_extract_service_placement_rules(lower_text, matched_service, primary_unit))

  return extracted


def extract_surgical_constraints_from_prompt(
  prompt: str,
  profile: InstitutionProfileSchema,
) -> list[SurgicalScheduleConstraint]:
  """
  Extracts Use Case 2 (`SurgicalScheduleConstraint`) BEDS & POINTS rules from a natural-language prompt.

  Args:
      prompt (str): Natural language instruction from the surgical or operational leader.
      profile (InstitutionProfileSchema): Active institution profile.

  Returns:
      list[SurgicalScheduleConstraint]: Extracted surgical scheduling constraints.
  """
  lower_text = prompt.strip().lower()
  if not lower_text:
    return []

  unit_names = list(profile.unit_capacities.keys())
  cvicu_unit = next((u for u in unit_names if "CVICU" in u or "CICU" in u or "Cardiac" in u), unit_names[-1])
  picu_unit = next((u for u in unit_names if "PICU" in u or "ICU" in u), unit_names[0])

  extracted: list[SurgicalScheduleConstraint] = []
  program: Literal["BEDS", "POINTS", "ALL"] = (
    "POINTS" if "points" in lower_text or "cardiac" in lower_text else ("BEDS" if "beds" in lower_text else "ALL")
  )

  cap_match = re.search(r"(?:cap|max|limit)[^0-9]*?(\d+(?:\.\d+)?)", lower_text)
  if cap_match:
    val = max(float(cap_match.group(1)), 2.0)
    target_unit = cvicu_unit if "cvicu" in lower_text or program == "POINTS" else picu_unit
    extracted.append(
      SurgicalScheduleConstraint(
        constraint_type="max_daily_postop_admits",
        program=program,
        recovery_unit=target_unit,
        value=val,
        rationale=f"Cap daily post-operative admissions on {target_unit} at {val:g}.",
      )
    )

  emerg_match = re.search(r"reserve[^0-9]*?(\d+(?:\.\d+)?)\s*(?:emergency|urgent)?\s*beds?", lower_text)
  if emerg_match:
    val = float(emerg_match.group(1))
    extracted.append(
      SurgicalScheduleConstraint(
        constraint_type="reserve_emergency_beds",
        program=program,
        recovery_unit=picu_unit,
        value=val,
        rationale=f"Reserve {val:g} emergency recovery beds on {picu_unit}.",
      )
    )

  day_map: dict[str, Literal["Mon", "Tue", "Wed", "Thu", "Fri"]] = {
    "monday": "Mon",
    "tuesday": "Tue",
    "wednesday": "Wed",
    "thursday": "Thu",
    "friday": "Fri",
  }
  for day_word, day_code in day_map.items():
    if day_word in lower_text and any(k in lower_text for k in ("prohibit", "no ", "avoid")):
      extracted.append(
        SurgicalScheduleConstraint(
          constraint_type="prohibit_procedure_day",
          program=program,
          day_of_week=day_code,
          value=0.0,
          rationale=f"Avoid scheduling elective {program} procedures on {day_code}.",
        )
      )

  return extracted


def extract_staffing_constraints_from_prompt(prompt: str) -> list[StaffingConstraint]:
  """
  Extracts Use Case 3 (`StaffingConstraint`) physician and nurse scheduling rules from natural language.

  Args:
      prompt (str): Natural language staffing instruction.

  Returns:
      list[StaffingConstraint]: Extracted staffing optimization constraints.
  """
  lower_text = prompt.strip().lower()
  if not lower_text:
    return []

  extracted: list[StaffingConstraint] = []
  ot_match = re.search(r"overtime[^0-9]*?(\d+(?:\.\d+)?)", lower_text)
  if ot_match:
    val = max(float(ot_match.group(1)), 0.5)
    extracted.append(
      StaffingConstraint(
        constraint_type="max_overtime_shifts",
        unit="ALL",
        provider_role="RN",
        value=val,
        rationale=f"Cap unexpected RN overtime shifts at {val:g} per unit/week.",
      )
    )

  aday_match = re.search(r"a-?days?[^0-9]*?(\d+(?:\.\d+)?)", lower_text)
  if aday_match:
    val = max(float(aday_match.group(1)), 0.5)
    extracted.append(
      StaffingConstraint(
        constraint_type="max_a_days",
        unit="ALL",
        provider_role="RN",
        value=val,
        rationale=f"Cap RN Administrative Days (A-days) at {val:g} per unit/week.",
      )
    )

  float_match = re.search(r"float[^0-9]*?(\d+(?:\.\d+)?)", lower_text)
  if float_match:
    val = max(float(float_match.group(1)), 1.0)
    extracted.append(
      StaffingConstraint(
        constraint_type="float_pool_cap",
        unit="ALL",
        provider_role="FLOAT_RN",
        value=val,
        rationale=f"Configure cross-unit float pool capacity at {val:g} FTE shifts.",
      )
    )

  return extracted


def parse_llm_constraints_json_result(
  use_case: OptimizationUseCase,
  raw_llm_output: str,
  fallback_prompt: str,
  profile: InstitutionProfileSchema,
) -> AppResult[list[ServiceUnitConstraint] | list[SurgicalScheduleConstraint] | list[StaffingConstraint]]:
  """
  Parses raw or markdown-fenced JSON constraint arrays returned by an LLM using `pydantic.TypeAdapter`,
  falling back to deterministic rule-based extraction when `raw_llm_output` is empty or non-JSON.

  Args:
      use_case (OptimizationUseCase): Target optimization use case (`'service_unit'`, `'surgical_scheduling'`, or `'staffing_optimization'`).
      raw_llm_output (str): Raw text or JSON response from the LLM constraint translator.
      fallback_prompt (str): Original user prompt used for deterministic fallback extraction.
      profile (InstitutionProfileSchema): Active partner hospital profile.

  Returns:
      AppResult[list[ServiceUnitConstraint] | list[SurgicalScheduleConstraint] | list[StaffingConstraint]]:
          `Ok(constraints)` when valid JSON or fallback succeeds, or `Err(AppError)` when JSON is explicitly invalid against the schema.
  """
  cleaned = raw_llm_output.strip()
  fenced = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
  json_candidate = fenced.group(1).strip() if fenced else (cleaned if cleaned.startswith("[") else "")

  if json_candidate:
    try:
      if use_case == "service_unit":
        return Ok(_SERVICE_CONSTRAINTS_ADAPTER.validate_json(json_candidate))
      if use_case == "surgical_scheduling":
        return Ok(_SURGICAL_CONSTRAINTS_ADAPTER.validate_json(json_candidate))
      return Ok(_STAFFING_CONSTRAINTS_ADAPTER.validate_json(json_candidate))
    except ValidationError as exc:
      return Err(
        AppError(
          code=ErrorCode.OPTIMIZATION_INVALID_CONSTRAINT,
          message=f"Invalid LLM constraint JSON for {use_case}: {exc}",
          status_code=400,
        )
      )

  if use_case == "service_unit":
    return Ok(extract_service_unit_constraints_from_prompt(fallback_prompt, profile))
  if use_case == "surgical_scheduling":
    return Ok(extract_surgical_constraints_from_prompt(fallback_prompt, profile))
  return Ok(extract_staffing_constraints_from_prompt(fallback_prompt))


__all__ = [
  "extract_service_unit_constraints_from_prompt",
  "extract_staffing_constraints_from_prompt",
  "extract_surgical_constraints_from_prompt",
  "match_clinical_service",
  "parse_llm_constraints_json_result",
]
