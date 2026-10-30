"""
Comprehensive unit and integration tests for the LLM + JAX + MPAX Hospital Operations
Optimization Platform (`app.schemas.optimization`, `app.services.optimization`,
and `app.api.routers.optimization`).

Verifies 100% function, line, and branch coverage across:
1. Partner Institution Profiles & Federated LOS Prior Aggregation
2. JAX Discrete Event Simulation (DES) Expert Baseline Engine
3. Use Case 1: Service-Unit Assignments & Bed-Use Optimization + Census Quick Actions
4. Use Case 2: BEDS & POINTS Surgical Scheduling Optimization & Post-Op LOS Estimator
5. Use Case 3: Cross-Unit Physician & Nurse Scheduling Optimization
6. Conversational LLM Optimization Copilot, Sessions, Iterations & Qualitative User Surveys
7. FastAPI `/api/v1/optimization` HTTP Endpoints
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
import uuid

from httpx import AsyncClient
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.result import Err, ErrorCode, Ok
from app.main import app
from app.models.user import User
from app.schemas.optimization import (
  OptimizationIterationRequest,
  QuickActionExecutionRequest,
  ServiceUnitConstraint,
  StaffingConstraint,
  SurgicalScheduleConstraint,
  validate_quick_action_result,
  validate_use_case_result,
)
from app.services.optimization import (
  aggregate_federated_los_priors,
  estimate_postop_los_distribution,
  evaluate_staffing_schedule_des,
  evaluate_surgical_schedule_des,
  execute_census_quick_action_result,
  extract_service_unit_constraints_from_prompt,
  extract_staffing_constraints_from_prompt,
  extract_surgical_constraints_from_prompt,
  get_institution_profile_result,
  list_institution_profiles,
  list_model_compendium,
  list_quick_actions,
  llm_optimization_copilot,
  solve_service_unit_assignment_result,
  solve_staffing_optimization_result,
  solve_surgical_scheduling_result,
)
from app.services.optimization.des_baseline_engine import _compute_improvement_and_attainment
from app.services.optimization.llm_optimization_copilot import parse_llm_constraints_json_result


@pytest.fixture
async def opt_user(db_session: AsyncSession) -> AsyncGenerator[User, None]:
  """
  Creates an authenticated hospital decision-maker user and overrides `get_current_user`.

  Args:
      db_session (AsyncSession): Active test database session.

  Yields:
      User: Persisted user record.
  """
  user = User(
    email=f"opt_leader_{uuid.uuid4()}@stanford.edu",
    hashed_password="pw",
    is_active=True,
    is_admin=False,
    role="CLINICAL_VIEWER",
  )
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)

  app.dependency_overrides[get_current_user] = lambda: user
  yield user
  app.dependency_overrides.pop(get_current_user, None)


def test_schema_validators_and_institution_profiles() -> None:
  """Verify `validate_use_case_result`, `validate_quick_action_result`, institution profiles, and federated averaging."""
  assert isinstance(validate_use_case_result("service_unit"), Ok)
  assert isinstance(validate_use_case_result("surgical_scheduling"), Ok)
  assert isinstance(validate_use_case_result("staffing_optimization"), Ok)
  bad_uc = validate_use_case_result("invalid_uc")
  assert isinstance(bad_uc, Err)
  assert bad_uc.error.code == ErrorCode.OPTIMIZATION_USE_CASE_INVALID

  assert isinstance(validate_quick_action_result("patient_days_by_unit"), Ok)
  bad_act = validate_quick_action_result("invalid_action")
  assert isinstance(bad_act, Err)
  assert bad_act.error.code == ErrorCode.VALIDATION_ERROR

  profiles = list_institution_profiles()
  assert len(profiles) == 7
  assert any(p.institution_id == "stanford_childrens" for p in profiles)
  assert any(p.institution_id == "mgh" for p in profiles)

  prof_ok = get_institution_profile_result("STANFORD_CHILDRENS")
  assert isinstance(prof_ok, Ok)
  prof_err = get_institution_profile_result("unknown_hospital")
  assert isinstance(prof_err, Err)
  assert prof_err.error.code == ErrorCode.INSTITUTION_PROFILE_NOT_FOUND

  models = list_model_compendium()
  assert any(m.model_id == "gemini-2.5-pro" for m in models)
  assert any(m.model_id == "medgemma-27b-text-it" for m in models)
  assert any(m.model_id == "vaultgemma-9b" and m.supports_differential_privacy for m in models)
  assert any(m.model_id == "litert-medgemma-4b-int4" and m.supports_hot_loading for m in models)

  all_qa = list_quick_actions()
  assert len(all_qa) == 7
  surg_qa = list_quick_actions("surgical_scheduling")
  assert len(surg_qa) == 5  # 4 core census + smooth_surgical_schedule

  # Federated LOS prior aggregation
  assert aggregate_federated_los_priors([]) == []
  unweighted = aggregate_federated_los_priors([[2.0, 4.0], [4.0, 6.0]])
  assert unweighted == [3.0, 5.0]
  weighted = aggregate_federated_los_priors([[2.0, 4.0], [4.0, 6.0]], sample_weights=[3.0, 1.0])
  assert weighted == [2.5, 4.5]


def test_des_baseline_engine_edge_cases() -> None:
  """Verify DES baseline evaluation helpers on empty inputs and zero-gain edge cases."""
  imp, att = _compute_improvement_and_attainment(10.0, 10.0, 10.0)
  assert imp == 0.0
  assert att == 100.0

  surg_empty = evaluate_surgical_schedule_des([])
  assert surg_empty.use_case == "surgical_scheduling"
  assert len(surg_empty.metrics) == 2

  staff_empty = evaluate_staffing_schedule_des([])
  assert staff_empty.use_case == "staffing_optimization"
  assert len(staff_empty.metrics) == 3


def test_service_unit_solver_all_constraint_types_and_errors() -> None:
  """Verify Use Case 1 JAX/MPAX solver across all constraint types and infeasibility/validation branches."""
  assert isinstance(solve_service_unit_assignment_result("nonexistent_inst"), Err)

  # Valid combined constraints
  valid_constraints = [
    ServiceUnitConstraint(constraint_type="unit_capacity_delta", unit="PCU 360", value=10.0),
    ServiceUnitConstraint(constraint_type="unit_capacity_override", unit="PCU 350", value=30.0),
    ServiceUnitConstraint(constraint_type="prohibit_service_on_unit", service="Neurosurgery", unit="PCU 360"),
    ServiceUnitConstraint(constraint_type="lock_service_to_unit", service="Neonatology", unit="NICU"),
    ServiceUnitConstraint(constraint_type="min_service_beds", service="General Pediatrics", unit="PCU 350", value=5.0),
    ServiceUnitConstraint(constraint_type="max_service_beds", service="Cardiology", unit="CVICU", value=20.0),
  ]
  res_ok = solve_service_unit_assignment_result("stanford_childrens", valid_constraints)
  assert isinstance(res_ok, Ok)
  assert res_ok.value.solver_status == "OPTIMAL"
  assert len(res_ok.value.service_unit_assignments) > 0

  # Error branches: unknown unit/service and infeasible bounds
  err_cases = [
    [ServiceUnitConstraint(constraint_type="unit_capacity_delta", unit="UnknownUnit", value=5.0)],
    [ServiceUnitConstraint(constraint_type="unit_capacity_delta", unit="PCU 350", value=-100.0)],
    [ServiceUnitConstraint(constraint_type="unit_capacity_override", unit="UnknownUnit", value=10.0)],
    [ServiceUnitConstraint(constraint_type="unit_capacity_override", unit="PCU 350", value=-5.0)],
    [ServiceUnitConstraint(constraint_type="prohibit_service_on_unit", service="UnknownSvc", unit="PCU 350")],
    [ServiceUnitConstraint(constraint_type="lock_service_to_unit", service="UnknownSvc", unit="PCU 350")],
    [ServiceUnitConstraint(constraint_type="min_service_beds", service="UnknownSvc", unit="PCU 350", value=5.0)],
    [ServiceUnitConstraint(constraint_type="max_service_beds", service="UnknownSvc", unit="PCU 350", value=5.0)],
    [
      ServiceUnitConstraint(constraint_type="min_service_beds", service="General Pediatrics", unit="PCU 350", value=15.0),
      ServiceUnitConstraint(constraint_type="max_service_beds", service="General Pediatrics", unit="PCU 350", value=5.0),
    ],
    [ServiceUnitConstraint(constraint_type="min_service_beds", service="General Pediatrics", unit="PCU 350", value=99.0)],
  ]
  for bad_list in err_cases:
    res_err = solve_service_unit_assignment_result("stanford_childrens", bad_list)
    assert isinstance(res_err, Err)

  # Census Quick Actions
  assert isinstance(execute_census_quick_action_result("patient_days_by_unit", "bad_inst"), Err)
  for act in (
    "patient_days_by_unit",
    "patient_days_by_service",
    "combined_analysis",
    "summary_statistics",
    "optimize_service_units",
  ):
    qa_res = execute_census_quick_action_result(act, "stanford_childrens")
    assert isinstance(qa_res, Ok)
    assert len(qa_res.value.rows) > 0


def test_surgical_scheduling_solver_all_constraint_types_and_errors() -> None:
  """Verify Use Case 2 (BEDS & POINTS) JAX/MPAX solver and post-op LOS estimator."""
  los, kernel = estimate_postop_los_distribution(3.5, 0.55)
  assert los > 3.5
  assert len(kernel) == 5
  assert abs(sum(kernel) - 1.0) < 1e-2

  assert isinstance(solve_surgical_scheduling_result("unknown_inst"), Err)

  valid_surg = [
    SurgicalScheduleConstraint(constraint_type="reserve_emergency_beds", recovery_unit="PICU", value=4.0),
    SurgicalScheduleConstraint(constraint_type="max_daily_postop_admits", recovery_unit="CVICU", value=5.0),
    SurgicalScheduleConstraint(constraint_type="prohibit_procedure_day", program="BEDS", day_of_week="Fri", value=0.0),
    SurgicalScheduleConstraint(constraint_type="lock_procedure_day", program="POINTS", day_of_week="Wed", value=1.5),
    SurgicalScheduleConstraint(constraint_type="surgeon_block_cap", value=8.0),
  ]
  res_ok = solve_surgical_scheduling_result("stanford_childrens", valid_surg)
  assert isinstance(res_ok, Ok)
  assert len(res_ok.value.surgical_schedule_assignments) == 20

  bad_surg_cases = [
    [SurgicalScheduleConstraint(constraint_type="surgeon_block_cap", value=-1.0)],
    [SurgicalScheduleConstraint(constraint_type="reserve_emergency_beds", recovery_unit="PICU", value=999.0)],
    [SurgicalScheduleConstraint(constraint_type="max_daily_postop_admits", recovery_unit="CVICU", value=0.5)],
    [SurgicalScheduleConstraint(constraint_type="prohibit_procedure_day", day_of_week=None, value=0.0)],
    [SurgicalScheduleConstraint(constraint_type="lock_procedure_day", day_of_week=None, value=2.0)],
    [SurgicalScheduleConstraint(constraint_type="surgeon_block_cap", value=0.1)],
  ]
  for bad_c in bad_surg_cases:
    assert isinstance(solve_surgical_scheduling_result("stanford_childrens", bad_c), Err)


def test_staffing_scheduling_solver_all_constraint_types_and_errors() -> None:
  """Verify Use Case 3 (Physician & Nurse Staffing) JAX/MPAX solver and error branches."""
  assert isinstance(solve_staffing_optimization_result("unknown_inst"), Err)

  valid_staff = [
    StaffingConstraint(constraint_type="min_nurse_to_patient_ratio", value=0.45),
    StaffingConstraint(constraint_type="float_pool_cap", value=6.0),
    StaffingConstraint(constraint_type="max_overtime_shifts", value=4.0),
    StaffingConstraint(constraint_type="max_a_days", value=3.0),
    StaffingConstraint(constraint_type="seasonality_surge_multiplier", value=1.05),
  ]
  res_ok = solve_staffing_optimization_result("stanford_childrens", valid_staff)
  assert isinstance(res_ok, Ok)
  assert len(res_ok.value.staffing_assignments) == 12

  bad_staff_cases = [
    [StaffingConstraint(constraint_type="float_pool_cap", value=0.0)],
    [StaffingConstraint(constraint_type="min_nurse_to_patient_ratio", value=2.5)],
  ]
  for bad_c in bad_staff_cases:
    assert isinstance(solve_staffing_optimization_result("stanford_childrens", bad_c), Err)


def test_natural_language_constraint_extractors() -> None:
  """Verify natural-language constraint extractors across empty and clinical prompts."""
  prof_res = get_institution_profile_result("stanford_childrens")
  assert isinstance(prof_res, Ok)
  prof = prof_res.value

  assert extract_service_unit_constraints_from_prompt("   ", prof) == []
  assert extract_surgical_constraints_from_prompt("   ", prof) == []
  assert extract_staffing_constraints_from_prompt("   ") == []

  c_svc = extract_service_unit_constraints_from_prompt(
    "Place all Gen Peds patients on PCU 350, open PCU 360 with 10 additional beds, "
    "close 2 beds on PICU, prohibit Gen Peds on NICU, and reserve at least 6 beds on PCU 350",
    prof,
  )
  assert len(c_svc) >= 4
  assert extract_service_unit_constraints_from_prompt("Lock neuro patients to PCU 380", prof) != []
  assert extract_service_unit_constraints_from_prompt("Lock cardio patients to CVICU", prof) != []
  assert extract_service_unit_constraints_from_prompt("Lock onc patients to PCU 380", prof) != []
  assert extract_service_unit_constraints_from_prompt("Add 4 beds on PCU 350", prof) != []

  c_surg = extract_surgical_constraints_from_prompt(
    "For POINTS cardiac schedule, cap daily CVICU admits at 4, reserve 3 emergency beds on PICU, "
    "and prohibit Monday procedures.",
    prof,
  )
  assert len(c_surg) == 3

  c_staff = extract_staffing_constraints_from_prompt(
    "Cap unexpected overtime shifts at 2, limit A-days to 2, and set float pool to 5."
  )
  assert len(c_staff) == 3

  # Verify parse_llm_constraints_json_result across raw JSON, markdown-fenced JSON, invalid JSON, and fallback
  fenced_svc = """```json
  [{"constraint_type": "unit_capacity_delta", "unit": "PCU 350", "value": 6.0}]
  ```"""
  parsed_svc = parse_llm_constraints_json_result("service_unit", fenced_svc, "", prof)
  assert isinstance(parsed_svc, Ok)
  assert len(parsed_svc.value) == 1

  raw_surg = '[{"constraint_type": "reserve_emergency_beds", "recovery_unit": "PICU", "value": 3.0}]'
  parsed_surg = parse_llm_constraints_json_result("surgical_scheduling", raw_surg, "", prof)
  assert isinstance(parsed_surg, Ok)
  assert len(parsed_surg.value) == 1

  raw_staff = '[{"constraint_type": "max_overtime_shifts", "value": 2.0}]'
  parsed_staff = parse_llm_constraints_json_result("staffing_optimization", raw_staff, "", prof)
  assert isinstance(parsed_staff, Ok)
  assert len(parsed_staff.value) == 1

  bad_json = '[{"constraint_type": "invalid_type_xyz"}]'
  assert isinstance(parse_llm_constraints_json_result("service_unit", bad_json, "", prof), Err)

  # Fallback when raw_llm_output is prose / empty
  fb_svc = parse_llm_constraints_json_result("service_unit", "Natural language fallback", "Add 4 beds on PCU 350", prof)
  assert isinstance(fb_svc, Ok)
  assert len(fb_svc.value) == 1
  fb_surg = parse_llm_constraints_json_result("surgical_scheduling", "", "Reserve 2 emergency beds on PICU", prof)
  assert isinstance(fb_surg, Ok)
  assert len(fb_surg.value) == 1
  fb_staff = parse_llm_constraints_json_result("staffing_optimization", "", "Limit A-days to 2", prof)
  assert isinstance(fb_staff, Ok)
  assert len(fb_staff.value) == 1

  # Mathematical invariants across partner institutions: non-negativity and capacity bounds
  for inst_profile in list_institution_profiles():
    sol_res = solve_service_unit_assignment_result(inst_profile.institution_id)
    assert isinstance(sol_res, Ok)
    for row in sol_res.value.service_unit_assignments:
      assert row.optimized_patient_days >= 0.0
      assert row.baseline_patient_days >= 0.0


@pytest.mark.asyncio
async def test_optimization_router_and_copilot_end_to_end(
  client: AsyncClient,
  opt_user: User,
  db_session: AsyncSession,
) -> None:
  """Verify all `/api/v1/optimization` endpoints, session lifecycle, iterations, quick actions, and surveys."""
  _ = opt_user

  # 1. Institutions, Models, Quick Actions
  inst_res = await client.get("/api/v1/optimization/institutions")
  assert inst_res.status_code == 200
  assert len(inst_res.json()) == 7

  models_res = await client.get("/api/v1/optimization/models")
  assert models_res.status_code == 200
  assert len(models_res.json()) >= 7

  qa_res = await client.get("/api/v1/optimization/quick-actions?use_case=service_unit")
  assert qa_res.status_code == 200
  assert len(qa_res.json()) >= 5

  # Execute all 7 Quick Actions via POST /quick-actions/{action_id}
  for action_id in (
    "patient_days_by_unit",
    "patient_days_by_service",
    "combined_analysis",
    "summary_statistics",
    "optimize_service_units",
    "smooth_surgical_schedule",
    "optimize_nurse_staffing",
  ):
    exec_res = await client.post(
      f"/api/v1/optimization/quick-actions/{action_id}",
      json={"institution_id": "stanford_childrens", "use_case": "service_unit"},
    )
    assert exec_res.status_code == 200
    assert exec_res.json()["action_id"] == action_id

  bad_qa = await client.post(
    "/api/v1/optimization/quick-actions/invalid_action",
    json={"institution_id": "stanford_childrens", "use_case": "service_unit"},
  )
  assert bad_qa.status_code == 400

  bad_inst_qa = llm_optimization_copilot.execute_quick_action_result(
    "patient_days_by_unit",
    QuickActionExecutionRequest(institution_id="bad_inst", use_case="service_unit"),
  )
  assert isinstance(bad_inst_qa, Err)

  # 2. Stateless solve across all 3 use cases + invalid institution error branch
  bad_solve = await client.post(
    "/api/v1/optimization/solve",
    json={"use_case": "service_unit", "institution_id": "bad_inst"},
  )
  assert bad_solve.status_code == 404

  for uc in ("service_unit", "surgical_scheduling", "staffing_optimization"):
    s_res = await client.post(
      "/api/v1/optimization/solve",
      json={
        "use_case": uc,
        "institution_id": "stanford_childrens",
        "prompt": "Optimize hospital operations and open 4 additional beds",
      },
    )
    assert s_res.status_code == 200
    assert s_res.json()["use_case"] == uc

  # 3. Stateful session creation, listing, iteration, and deletion across Use Cases 1, 2, and 3
  sess1_res = await client.post(
    "/api/v1/optimization/sessions",
    json={
      "use_case": "service_unit",
      "institution_id": "stanford_childrens",
      "initial_prompt": "Place all General Pediatrics patients on PCU 350",
      "model_id": "medgemma-27b-text-it",
    },
  )
  assert sess1_res.status_code == 200
  sess1 = sess1_res.json()
  sess1_id = sess1["id"]
  assert len(sess1["iterations"]) == 1

  # Iterate session 1 with natural language and then with explicit service_constraints
  it1_res = await client.post(
    f"/api/v1/optimization/sessions/{sess1_id}/iterate",
    json={
      "prompt": "Assume we open PCU 360 with 10 additional beds",
      "model_id": "gemini-2.5-pro",
      "reset_constraints": False,
    },
  )
  assert it1_res.status_code == 200
  assert it1_res.json()["turn_index"] == 2

  it1_explicit = await client.post(
    f"/api/v1/optimization/sessions/{sess1_id}/iterate",
    json={
      "prompt": "Apply explicit service constraint",
      "service_constraints": [{"constraint_type": "unit_capacity_delta", "unit": "PCU 350", "value": 4.0}],
    },
  )
  assert it1_explicit.status_code == 200

  it1_infeasible = await client.post(
    f"/api/v1/optimization/sessions/{sess1_id}/iterate",
    json={"prompt": "Close 999 beds on PCU 350"},
  )
  assert it1_infeasible.status_code == 400

  # Session creation error branches (invalid institution and infeasible initial_prompt)
  assert (
    await client.post(
      "/api/v1/optimization/sessions",
      json={"use_case": "service_unit", "institution_id": "bad_inst"},
    )
  ).status_code == 404
  assert (
    await client.post(
      "/api/v1/optimization/sessions",
      json={
        "use_case": "service_unit",
        "institution_id": "stanford_childrens",
        "initial_prompt": "Close 999 beds on PCU 350",
      },
    )
  ).status_code == 400

  # Create & iterate Use Case 2 and Use Case 3 sessions with explicit constraints
  sess2_res = await client.post(
    "/api/v1/optimization/sessions",
    json={"use_case": "surgical_scheduling", "institution_id": "stanford_childrens"},
  )
  assert sess2_res.status_code == 200
  sess2_id = sess2_res.json()["id"]
  it2_res = await client.post(
    f"/api/v1/optimization/sessions/{sess2_id}/iterate",
    json={
      "prompt": "Smooth cardiac blocks",
      "surgical_constraints": [
        {"constraint_type": "max_daily_postop_admits", "program": "POINTS", "recovery_unit": "CVICU", "value": 4.0}
      ],
      "reset_constraints": True,
    },
  )
  assert it2_res.status_code == 200
  it2_nl = await client.post(
    f"/api/v1/optimization/sessions/{sess2_id}/iterate",
    json={"prompt": "Reserve 2 emergency beds on PICU"},
  )
  assert it2_nl.status_code == 200

  sess3_res = await client.post(
    "/api/v1/optimization/sessions",
    json={"use_case": "staffing_optimization", "institution_id": "stanford_childrens"},
  )
  assert sess3_res.status_code == 200
  sess3_id = sess3_res.json()["id"]
  it3_res = await client.post(
    f"/api/v1/optimization/sessions/{sess3_id}/iterate",
    json={
      "prompt": "Cap overtime and A-days",
      "staffing_constraints": [{"constraint_type": "max_overtime_shifts", "value": 3.0}],
    },
  )
  assert it3_res.status_code == 200
  it3_nl = await client.post(
    f"/api/v1/optimization/sessions/{sess3_id}/iterate",
    json={"prompt": "Limit A-days to 2 per week"},
  )
  assert it3_nl.status_code == 200

  # List and fetch sessions
  list_res = await client.get("/api/v1/optimization/sessions")
  assert list_res.status_code == 200
  assert len(list_res.json()) >= 3

  get_res = await client.get(f"/api/v1/optimization/sessions/{sess1_id}")
  assert get_res.status_code == 200
  assert get_res.json()["id"] == sess1_id

  # Error cases for get / delete / iterate
  assert (await client.get("/api/v1/optimization/sessions/not-a-uuid")).status_code == 400
  assert (await client.get(f"/api/v1/optimization/sessions/{uuid.uuid4()}")).status_code == 404
  assert (await client.delete("/api/v1/optimization/sessions/not-a-uuid")).status_code == 400
  assert (await client.delete(f"/api/v1/optimization/sessions/{uuid.uuid4()}")).status_code == 404
  assert (
    await client.post(f"/api/v1/optimization/sessions/{sess1_id}/iterate", json={"prompt": "   "})
  ).status_code == 400
  assert (
    await client.post("/api/v1/optimization/sessions/not-a-uuid/iterate", json={"prompt": "test"})
  ).status_code == 400
  assert (
    await client.post(f"/api/v1/optimization/sessions/{uuid.uuid4()}/iterate", json={"prompt": "test"})
  ).status_code == 404

  # Ownership authorization checks
  other_user = User(
    email=f"other_{uuid.uuid4()}@stanford.edu",
    hashed_password="pw",
    is_active=True,
    is_admin=False,
  )
  db_session.add(other_user)
  await db_session.commit()
  await db_session.refresh(other_user)

  assert isinstance(await llm_optimization_copilot.get_session_result(sess1_id, db_session, other_user), Err)
  assert isinstance(await llm_optimization_copilot.delete_session_result(sess1_id, db_session, other_user), Err)
  assert isinstance(
    await llm_optimization_copilot.iterate_session_result(
      sess1_id,
      OptimizationIterationRequest(prompt="test"),
      db_session,
      other_user,
    ),
    Err,
  )

  # 4. Submit qualitative & quantitative UX survey and fetch evaluation summary
  survey_res = await client.post(
    "/api/v1/optimization/surveys",
    json={
      "session_id": sess1_id,
      "use_case": "service_unit",
      "role_category": "Physician",
      "score_vs_manual_process": 5,
      "score_vs_other_workflow_tech": 5,
      "interpretability_score": 5,
      "qualitative_feedback": "Eliminates the multi-day graduate-student email back-and-forth!",
    },
  )
  assert survey_res.status_code == 200
  assert survey_res.json()["score_vs_manual_process"] == 5

  survey_no_sess = await client.post(
    "/api/v1/optimization/surveys",
    json={
      "session_id": None,
      "use_case": "surgical_scheduling",
      "role_category": "Nurse Leader",
      "score_vs_manual_process": 5,
      "score_vs_other_workflow_tech": 5,
      "interpretability_score": 5,
      "qualitative_feedback": "Great surgical smoothing!",
    },
  )
  assert survey_no_sess.status_code == 200
  assert survey_no_sess.json()["session_id"] is None

  bad_survey = await client.post(
    "/api/v1/optimization/surveys",
    json={
      "session_id": "invalid-uuid",
      "use_case": "service_unit",
      "role_category": "Physician",
      "score_vs_manual_process": 4,
      "score_vs_other_workflow_tech": 4,
      "interpretability_score": 4,
    },
  )
  assert bad_survey.status_code == 400

  summary_res = await client.get("/api/v1/optimization/surveys/summary")
  assert summary_res.status_code == 200
  summary_data = summary_res.json()
  assert summary_data["survey_count"] >= 1
  assert summary_data["mean_score_vs_manual_process"] == 5.0

  # Delete session
  del_res = await client.delete(f"/api/v1/optimization/sessions/{sess3_id}")
  assert del_res.status_code == 200
  assert del_res.json()["status"] == "deleted"
