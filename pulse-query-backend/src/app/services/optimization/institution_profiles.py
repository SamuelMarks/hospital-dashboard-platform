"""
Multi-Institutional Partner Profiles, Model Compendium & Federated Collaboration Helpers.

Defines the operational baselines for the seven partner hospitals in `MPAX_PROJECT_PLAN.md`:
1. `stanford_childrens`: Stanford Medicine Children's Health (Lucile Packard Children's Hospital)
2. `stanford_health_care`: Stanford Health Care (Adult Hospital)
3. `chop`: The Children's Hospital of Philadelphia
4. `childrens_mercy_kc`: Children's Mercy Kansas City
5. `rady_childrens_ucsd`: Rady Children's Health (UCSD)
6. `ucsd_health`: UCSD Health (Adult Hospital)
7. `mgh`: Massachusetts General Hospital

Also provides the Model Compendium (Gemini 2.5 Pro, Gemma, MedGemma, VaultGemma, DeepSeek, Llama,
and LiteRT On-Device models), Quick Action definitions matching the alpha Bed-Use Tool, and
privacy-preserving federated parameter aggregation using JAX.
"""

from __future__ import annotations

from collections.abc import Sequence

import jax.numpy as jnp

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.optimization import (
  InstitutionProfileSchema,
  ModelCompendiumEntrySchema,
  QuickActionDefinitionSchema,
)

INSTITUTION_PROFILES: dict[str, InstitutionProfileSchema] = {
  "stanford_childrens": InstitutionProfileSchema(
    institution_id="stanford_childrens",
    name="Stanford Medicine Children's Health (Lucile Packard Children's Hospital)",
    short_name="Stanford Children's",
    hospital_type="pediatric",
    total_licensed_beds=156,
    unit_capacities={
      "PCU 350": 28,
      "PCU 360": 24,
      "PCU 380": 26,
      "PICU": 32,
      "CVICU": 22,
      "NICU": 24,
    },
    clinical_services=[
      "General Pediatrics",
      "Neurosurgery",
      "Cardiology",
      "Oncology",
      "Pulmonary",
      "Neonatology",
    ],
    home_unit_map={
      "General Pediatrics": ["PCU 350", "PCU 360"],
      "Neurosurgery": ["PCU 380", "PICU"],
      "Cardiology": ["CVICU", "PCU 360"],
      "Oncology": ["PCU 380"],
      "Pulmonary": ["PCU 350", "PICU"],
      "Neonatology": ["NICU"],
    },
    surgical_programs=["BEDS", "POINTS"],
    federated_node_enabled=True,
  ),
  "stanford_health_care": InstitutionProfileSchema(
    institution_id="stanford_health_care",
    name="Stanford Health Care (Adult Hospital)",
    short_name="Stanford Health Care",
    hospital_type="adult",
    total_licensed_beds=240,
    unit_capacities={
      "500P MedSurg": 48,
      "600P Neuro": 40,
      "700P Oncology": 42,
      "Adult ICU": 54,
      "CVICU Adult": 32,
      "StepDown CDU": 24,
    },
    clinical_services=[
      "Internal Medicine",
      "Neurosurgery",
      "Cardiovascular",
      "Medical Oncology",
      "Orthopedics",
      "Trauma Surgery",
    ],
    home_unit_map={
      "Internal Medicine": ["500P MedSurg", "StepDown CDU"],
      "Neurosurgery": ["600P Neuro", "Adult ICU"],
      "Cardiovascular": ["CVICU Adult", "StepDown CDU"],
      "Medical Oncology": ["700P Oncology"],
      "Orthopedics": ["500P MedSurg", "600P Neuro"],
      "Trauma Surgery": ["Adult ICU", "500P MedSurg"],
    },
    surgical_programs=["BEDS", "POINTS"],
    federated_node_enabled=True,
  ),
  "chop": InstitutionProfileSchema(
    institution_id="chop",
    name="The Children's Hospital of Philadelphia",
    short_name="CHOP",
    hospital_type="pediatric",
    total_licensed_beds=190,
    unit_capacities={
      "PCU East": 36,
      "PCU West": 34,
      "Neuro-Oncology Unit": 30,
      "PICU Main": 38,
      "CICU": 26,
      "NICU Level IV": 26,
    },
    clinical_services=[
      "General Pediatrics",
      "Neurosurgery",
      "Cardiology",
      "Oncology",
      "Pulmonary",
      "Neonatology",
    ],
    home_unit_map={
      "General Pediatrics": ["PCU East", "PCU West"],
      "Neurosurgery": ["Neuro-Oncology Unit", "PICU Main"],
      "Cardiology": ["CICU", "PCU West"],
      "Oncology": ["Neuro-Oncology Unit"],
      "Pulmonary": ["PCU East", "PICU Main"],
      "Neonatology": ["NICU Level IV"],
    },
    surgical_programs=["BEDS", "POINTS"],
    federated_node_enabled=True,
  ),
  "childrens_mercy_kc": InstitutionProfileSchema(
    institution_id="childrens_mercy_kc",
    name="Children's Mercy Kansas City",
    short_name="Children's Mercy KC",
    hospital_type="pediatric",
    total_licensed_beds=144,
    unit_capacities={
      "4 Henson PCU": 28,
      "5 Sutherland PCU": 26,
      "6 Surgical Unit": 24,
      "PICU": 26,
      "Cardiac ICU": 20,
      "NICU": 20,
    },
    clinical_services=[
      "General Pediatrics",
      "Neurosurgery",
      "Cardiology",
      "Oncology",
      "Pulmonary",
      "Neonatology",
    ],
    home_unit_map={
      "General Pediatrics": ["4 Henson PCU", "5 Sutherland PCU"],
      "Neurosurgery": ["6 Surgical Unit", "PICU"],
      "Cardiology": ["Cardiac ICU", "5 Sutherland PCU"],
      "Oncology": ["4 Henson PCU"],
      "Pulmonary": ["5 Sutherland PCU", "PICU"],
      "Neonatology": ["NICU"],
    },
    surgical_programs=["BEDS", "POINTS"],
    federated_node_enabled=True,
  ),
  "rady_childrens_ucsd": InstitutionProfileSchema(
    institution_id="rady_childrens_ucsd",
    name="Rady Children's Health (UCSD)",
    short_name="Rady Children's",
    hospital_type="pediatric",
    total_licensed_beds=150,
    unit_capacities={
      "Medical West 3": 30,
      "Surgical East 3": 26,
      "Hematology/Oncology": 24,
      "PICU": 28,
      "CTICU": 20,
      "NICU": 22,
    },
    clinical_services=[
      "General Pediatrics",
      "Neurosurgery",
      "Cardiology",
      "Oncology",
      "Pulmonary",
      "Neonatology",
    ],
    home_unit_map={
      "General Pediatrics": ["Medical West 3"],
      "Neurosurgery": ["Surgical East 3", "PICU"],
      "Cardiology": ["CTICU", "Surgical East 3"],
      "Oncology": ["Hematology/Oncology"],
      "Pulmonary": ["Medical West 3", "PICU"],
      "Neonatology": ["NICU"],
    },
    surgical_programs=["BEDS", "POINTS"],
    federated_node_enabled=True,
  ),
  "ucsd_health": InstitutionProfileSchema(
    institution_id="ucsd_health",
    name="UCSD Health (Adult Hospital)",
    short_name="UCSD Health",
    hospital_type="adult",
    total_licensed_beds=210,
    unit_capacities={
      "Jacobs 4 MedSurg": 44,
      "Jacobs 6 Neuro": 36,
      "Jacobs 8 Onc": 36,
      "Adult ICU": 42,
      "Sulpizio CVICU": 28,
      "Progressive Care": 24,
    },
    clinical_services=[
      "Internal Medicine",
      "Neurosurgery",
      "Cardiovascular",
      "Medical Oncology",
      "Orthopedics",
      "Trauma Surgery",
    ],
    home_unit_map={
      "Internal Medicine": ["Jacobs 4 MedSurg", "Progressive Care"],
      "Neurosurgery": ["Jacobs 6 Neuro", "Adult ICU"],
      "Cardiovascular": ["Sulpizio CVICU", "Progressive Care"],
      "Medical Oncology": ["Jacobs 8 Onc"],
      "Orthopedics": ["Jacobs 4 MedSurg", "Jacobs 6 Neuro"],
      "Trauma Surgery": ["Adult ICU", "Jacobs 4 MedSurg"],
    },
    surgical_programs=["BEDS", "POINTS"],
    federated_node_enabled=True,
  ),
  "mgh": InstitutionProfileSchema(
    institution_id="mgh",
    name="Massachusetts General Hospital",
    short_name="Mass General (MGH)",
    hospital_type="adult",
    total_licensed_beds=260,
    unit_capacities={
      "White 9 Med": 52,
      "Lunder 7 Neuro": 44,
      "Phillips Oncology": 44,
      "Blake MICU/SICU": 56,
      "Corrigan CVICU": 34,
      "Ellison StepDown": 30,
    },
    clinical_services=[
      "Internal Medicine",
      "Neurosurgery",
      "Cardiovascular",
      "Medical Oncology",
      "Orthopedics",
      "Trauma Surgery",
    ],
    home_unit_map={
      "Internal Medicine": ["White 9 Med", "Ellison StepDown"],
      "Neurosurgery": ["Lunder 7 Neuro", "Blake MICU/SICU"],
      "Cardiovascular": ["Corrigan CVICU", "Ellison StepDown"],
      "Medical Oncology": ["Phillips Oncology"],
      "Orthopedics": ["White 9 Med", "Lunder 7 Neuro"],
      "Trauma Surgery": ["Blake MICU/SICU", "White 9 Med"],
    },
    surgical_programs=["BEDS", "POINTS"],
    federated_node_enabled=True,
  ),
}

MODEL_COMPENDIUM: tuple[ModelCompendiumEntrySchema, ...] = (
  ModelCompendiumEntrySchema(
    model_id="gemini-2.5-pro",
    display_name="Gemini 2.5 Pro (Regulatory-Compliant Cloud Agent)",
    family="gemini",
    deployment_target="gcp_cloud",
    supports_differential_privacy=False,
    supports_hot_loading=False,
  ),
  ModelCompendiumEntrySchema(
    model_id="medgemma-27b-text-it",
    display_name="MedGemma 27B (JAX/TPU Clinical Optimization Tuned)",
    family="medgemma",
    deployment_target="tpu_fine_tuned",
    supports_differential_privacy=False,
    supports_hot_loading=False,
  ),
  ModelCompendiumEntrySchema(
    model_id="vaultgemma-9b",
    display_name="VaultGemma 9B (Differentially Private Healthcare LLM)",
    family="vaultgemma",
    deployment_target="tpu_fine_tuned",
    supports_differential_privacy=True,
    supports_hot_loading=False,
  ),
  ModelCompendiumEntrySchema(
    model_id="gemma4:26b",
    display_name="Gemma 4 26B (JAX/MaxText TPU Fine-Tuned)",
    family="gemma",
    deployment_target="local_ollama",
    supports_differential_privacy=False,
    supports_hot_loading=False,
  ),
  ModelCompendiumEntrySchema(
    model_id="deepseek-r1",
    display_name="DeepSeek R1 (Mathematical Reasoning Comparator)",
    family="deepseek",
    deployment_target="local_ollama",
    supports_differential_privacy=False,
    supports_hot_loading=False,
  ),
  ModelCompendiumEntrySchema(
    model_id="llama-3.3-70b",
    display_name="Llama 3.3 70B (Open-Source Comparator)",
    family="llama",
    deployment_target="local_ollama",
    supports_differential_privacy=False,
    supports_hot_loading=False,
  ),
  ModelCompendiumEntrySchema(
    model_id="litert-medgemma-4b-int4",
    display_name="LiteRT MedGemma 4B INT4 (On-Device Hot-Loadable Android/Chrome)",
    family="litert_odml",
    deployment_target="litert_on_device",
    supports_differential_privacy=True,
    supports_hot_loading=True,
  ),
)

QUICK_ACTIONS: tuple[QuickActionDefinitionSchema, ...] = (
  QuickActionDefinitionSchema(
    action_id="patient_days_by_unit",
    label="Patient Days by Unit",
    icon="📊",
    description="How many patient days each hospital unit had, with occupancy and capacity utilization.",
    use_case="service_unit",
    default_prompt="Show patient days by hospital unit and highlight units near capacity.",
  ),
  QuickActionDefinitionSchema(
    action_id="patient_days_by_service",
    label="Patient Days by Service",
    icon="🏥",
    description="How many patient days each medical service had, including on-service vs. off-service days.",
    use_case="service_unit",
    default_prompt="Break down patient days by clinical service and quantify off-service placements.",
  ),
  QuickActionDefinitionSchema(
    action_id="combined_analysis",
    label="Combined Analysis",
    icon="📈",
    description="Detailed cross-breakdown of patient days by both hospital unit and medical service.",
    use_case="service_unit",
    default_prompt="Run a combined unit-by-service census breakdown and identify off-service bottlenecks.",
  ),
  QuickActionDefinitionSchema(
    action_id="summary_statistics",
    label="Summary Statistics",
    icon="📋",
    description="Hospital-wide census summary statistics, peak percentiles, off-service days, and diverts.",
    use_case="service_unit",
    default_prompt="Summarize overall hospital census statistics, off-service days, and transfer diverts.",
  ),
  QuickActionDefinitionSchema(
    action_id="optimize_service_units",
    label="Optimize Service-Unit Assignments",
    icon="🛏️",
    description="Solve Use Case 1 in JAX/MPAX to minimize off-service days and denied transfers (diverts).",
    use_case="service_unit",
    default_prompt="Place all General Pediatrics patients on PCU 350 and assume we open PCU 360 with 10 additional beds.",
  ),
  QuickActionDefinitionSchema(
    action_id="smooth_surgical_schedule",
    label="Smooth Surgical Schedule (BEDS / POINTS)",
    icon="🩺",
    description="Solve Use Case 2 in JAX/MPAX to smooth post-operative bed demand and reduce short-notice cancellations.",
    use_case="surgical_scheduling",
    default_prompt="Smooth BEDS and POINTS elective surgical blocks to cap daily CVICU and PICU post-op admissions.",
  ),
  QuickActionDefinitionSchema(
    action_id="optimize_nurse_staffing",
    label="Optimize Nurse & Physician Staffing",
    icon="👩‍⚕️",
    description="Solve Use Case 3 in JAX/MPAX to reduce unexpected RN overtime, A-days, and staffing cost per patient day.",
    use_case="staffing_optimization",
    default_prompt="Optimize cross-unit RN and float pool scheduling across weekday and winter seasonal volume surges.",
  ),
)


def get_institution_profile_result(institution_id: str) -> AppResult[InstitutionProfileSchema]:
  """
  Retrieves a partner hospital institution profile by ID wrapped in an `AppResult`.

  Args:
      institution_id (str): Target institution profile identifier.

  Returns:
      AppResult[InstitutionProfileSchema]: `Ok(profile)` if found, else `Err(AppError)`.
  """
  key = institution_id.strip().lower()
  profile = INSTITUTION_PROFILES.get(key)
  if profile is None:
    return Err(
      AppError(
        code=ErrorCode.INSTITUTION_PROFILE_NOT_FOUND,
        message=f"Institution profile '{institution_id}' not found. Available: {', '.join(INSTITUTION_PROFILES)}",
        status_code=404,
      )
    )
  return Ok(profile)


def list_institution_profiles() -> list[InstitutionProfileSchema]:
  """
  Returns the ordered list of all configured partner hospital institution profiles.

  Returns:
      list[InstitutionProfileSchema]: List of institution profiles.
  """
  return list(INSTITUTION_PROFILES.values())


def list_model_compendium() -> list[ModelCompendiumEntrySchema]:
  """
  Returns the compendium of out-of-the-box, TPU fine-tuned, and LiteRT on-device models.

  Returns:
      list[ModelCompendiumEntrySchema]: List of supported model compendium entries.
  """
  return list(MODEL_COMPENDIUM)


def list_quick_actions(use_case: str | None = None) -> list[QuickActionDefinitionSchema]:
  """
  Returns the list of Quick Action definitions, optionally filtered by `use_case`.

  Note that the 4 census analytics quick actions (`patient_days_by_unit`, `patient_days_by_service`,
  `combined_analysis`, `summary_statistics`) are always included so users can inspect census data
  from any view, matching the alpha Bed-Use Tool screenshot.

  Args:
      use_case (str | None): Optional use case filter string.

  Returns:
      list[QuickActionDefinitionSchema]: Matching Quick Action definitions.
  """
  if not use_case:
    return list(QUICK_ACTIONS)
  core_census_ids = {
    "patient_days_by_unit",
    "patient_days_by_service",
    "combined_analysis",
    "summary_statistics",
  }
  return [qa for qa in QUICK_ACTIONS if qa.use_case == use_case or qa.action_id in core_census_ids]


def aggregate_federated_los_priors(
  institutional_los_vectors: Sequence[Sequence[float]],
  sample_weights: Sequence[float] | None = None,
) -> list[float]:
  """
  Aggregates non-PHI post-operative or service Length-of-Stay (LOS) distribution parameters
  across partner institutions using JAX weighted federated averaging.

  Preserves patient privacy by operating strictly on institutional summary vectors rather
  than patient-level records.

  Args:
      institutional_los_vectors (Sequence[Sequence[float]]): Per-institution LOS parameter vectors.
      sample_weights (Sequence[float] | None): Optional institutional volume weights.

  Returns:
      list[float]: Federated average LOS parameter vector.
  """
  if not institutional_los_vectors:
    return []

  matrix = jnp.asarray(institutional_los_vectors, dtype=jnp.float32)
  if sample_weights is not None and len(sample_weights) == len(institutional_los_vectors):
    weights = jnp.asarray(sample_weights, dtype=jnp.float32)
    total_w = jnp.maximum(jnp.sum(weights), 1e-6)
    norm_weights = (weights / total_w)[:, None]
    fed_avg = jnp.sum(matrix * norm_weights, axis=0)
  else:
    fed_avg = jnp.mean(matrix, axis=0)

  return [round(float(x), 4) for x in fed_avg.tolist()]


__all__ = [
  "INSTITUTION_PROFILES",
  "MODEL_COMPENDIUM",
  "QUICK_ACTIONS",
  "aggregate_federated_los_priors",
  "get_institution_profile_result",
  "list_institution_profiles",
  "list_model_compendium",
  "list_quick_actions",
]
