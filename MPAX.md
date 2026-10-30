# Self-Service Hospital Operations Optimization Platform (LLM + JAX + MPAX)

> **Purpose:** This document describes the architecture, mathematical formulations, Discrete Event Simulation (DES) expert baselines, LLM copilot workflow, and Google Cloud TPU / LiteRT tooling for the **Stanford Medicine Children's Health / Scheinker Lab Hospital Operations Optimization Platform**.

---

## 1. Executive Summary & Clinical Motivation

Developing and deploying mathematical optimization models in hospitals has historically required teams of optimization experts, clinicians, and graduate students exchanging emails, spreadsheets, and meetings over **weeks to months** for every single iteration.

Pulse Query replaces that manual bottleneck with a **Self-Service, Interpretable LLM + JAX + MPAX Hospital Operations Optimization Platform** (`/optimization`, `/api/v1/optimization`). Doctors, nurse leaders, and hospital executives interact directly in natural language to:

1. Specify operational goals and constraints (e.g., _"Place all General Pediatrics patients on PCU 350 and assume we open PCU 360 with 10 additional beds"_).
2. Solve the resulting mathematical program in milliseconds using **MPAX** (Mathematical Programming in **JAX**).
3. Evaluate the optimized policy against both historical manual hospital rules and a pre-solved **Expert-Attained Baseline** using a vectorized **JAX Discrete Event Simulation (DES)** engine.
4. Receive clear, clinically interpretable explanations and suggested follow-up iterations.

---

## 2. Three Core Clinical Optimization Use Cases

### Use Case 1: LLM-Enabled Service-Unit Assignments & Bed-Use Optimization (`service_unit`)

- **Clinical Problem:** Hospital patient units (e.g., PCU 350, PCU 360, PCU 380, PICU, CVICU, NICU) are staffed and equipped for specific clinical services (General Pediatrics, Neurosurgery, Cardiology, Oncology, Neonatal, Pulmonary). Placing patients on "off-service" units degrades specialized care, increases Length of Stay (LOS), and triggers transfer denials (diverts).
- **JAX + MPAX Formulation (`service_unit_solver.py`):**
  - **Decision Variables:** Bed allocations $b_{s,u}$ and daily patient routing flows $x_{s,u,t}$ solved via `mpax.create_lp` + `mpax.r2HPDHG` in JAX with deterministic capacity-preserving integer repair.
  - **Objective:** Minimize weighted **Off-Service Patient Days** and **Denied Transfer Requests (Diverts)**.
  - **Propensity-Matched LOS Estimator:** Quantifies expected patient-days saved from increased on-service placement.
  - **Built-In Alpha Bed-Use Quick Actions:**
    - `📊 Patient Days by Unit` (`patient_days_by_unit`)
    - `🏥 Patient Days by Service` (`patient_days_by_service`)
    - `📈 Combined Analysis` (`combined_analysis`)
    - `📋 Summary Statistics` (`summary_statistics`)

### Use Case 2: LLM-Enabled Surgical Scheduling — BEDS & POINTS (`surgical_scheduling`)

- **Clinical Problem:** Uncoordinated elective surgical block schedules cause post-operative inpatient unit surges, leading to **short-notice elective surgical cancellations** and long-tailed daily post-op admission distributions.
- **JAX + MPAX Formulation (`surgical_scheduling_solver.py`):**
  - **BEDS:** Non-cardiovascular elective surgical procedures.
  - **POINTS:** Cardiovascular surgical procedures requiring CVICU and step-down recovery beds.
  - Convolves scheduled daily surgical blocks with JAX post-operative Length of Stay (LOS) recovery kernels (`estimate_postop_los_distribution`) and solves a Min-Max / CVaR peak-smoothing LP in MPAX to minimize short-notice cancellations and bring **mean daily post-op admissions closer to median daily admissions**.

### Use Case 3: LLM-Enabled Physician & Nurse Scheduling (`staffing_optimization`)

- **Clinical Problem:** Single-unit manual nurse and physician scheduling ignores cross-unit float pools and weekday/monthly seasonality, causing high burnout from **unexpected overtime** and **Administrative Days (A-days)** (when RNs are sent home due to low census).
- **JAX + MPAX Formulation (`staffing_scheduling_solver.py`):**
  - Multi-unit shift allocation LP incorporating weekday and month-of-year seasonality and cross-trained float pool eligibility.
  - **Dual Objectives:**
    1. **Burnout Reduction:** Minimize shifts with unexpected RN overtime and minimize RN Administrative Days (A-days).
    2. **Cost & Productivity:** Minimize total RN staffing cost per patient day while maintaining safe nurse-to-patient acuity ratios.

---

## 3. Quantitative & Qualitative Evaluation Framework

1. **Metric 1 — Quantitative JAX Discrete Event Simulation (DES) Expert Baseline (`des_baseline_engine.py`):**
   - Vectorized Monte Carlo DES replications (`128` replications $ imes$ `180`-day horizon) compare:
     - **Manual Historical Policy**
     - **Expert-Attained Baseline** (pre-solved expert OR model)
     - **User + LLM Iterative MPAX Policy**
   - Reports % improvement over manual rules, % of expert baseline attained, and overall optimality gap (%).
2. **Metric 2 — Structured User Experience Survey (`POST /api/v1/optimization/surveys`):**
   - Captures 1–5 Likert ratings from physicians, nurse leaders, and operations executives comparing the tool against (A) the manual graduate-student email process and (B) other hospital workflow technology, plus clinical interpretability ratings and qualitative feedback.

---

## 4. Multi-Institutional Collaboration & Model Compendium

### Supported Partner Hospital Profiles (`institution_profiles.py`)

- **Stanford Medicine Children's Health** (`stanford_childrens`)
- **Stanford Health Care** (`stanford_health_care`)
- **The Children's Hospital of Philadelphia (CHOP)** (`chop`)
- **Children's Mercy Kansas City** (`childrens_mercy_kc`)
- **Rady Children's Health (UCSD)** (`rady_childrens_ucsd`)
- **UCSD Health** (`ucsd_health`)
- **Massachusetts General Hospital (MGH)** (`mgh`)

Includes privacy-preserving federated parameter aggregation (`aggregate_federated_institution_priors`) across partner hospitals without sharing row-level patient records.

### Model Compendium & LiteRT On-Device Hot-Loading

- **Cloud & Open-Weights Models:** **Gemini 2.5 Pro** (`gemini-2.5-pro`), **MedGemma** (`medgemma-27b-text-it`, `medgemma-4b-it`), **VaultGemma** (`vaultgemma-9b`, differentially private), **Gemma** (`gemma4:26b`, `gemma2:27b`), **DeepSeek** (`deepseek-r1`), and **Llama** (`llama-3.3-70b`).
- **On-Device ML (ODML) LiteRT Hot-Loading (`LiteRtModelManager.kt`):** Supports SHA-256 verification and live hot-loading of quantized `.litertlm` / `.tflite` models (`litert-medgemma-4b-int4`, `litert-vaultgemma-2b-int4`) on **Android** and **Chrome/WebAssembly** in Kotlin Multiplatform.

---

## 5. CLI & LibScript ML Commands

```bash
# Declarative LibScript ML lifecycle commands
libscript.sh train libscript.json
libscript.sh infer libscript.json

# 1. Generate gold-standard optimization benchmarks across all 3 use cases
cd pulse-query-backend && uv run python scripts/generate_optimization_benchmarks.py

# 2. Prepare JAX/Keras/MaxText TPU instruction-tuning dataset & LiteRT ODML manifest
cd pulse-query-backend && uv run python scripts/train_tpu_optimization_llm.py

# 3. Evaluate the full model compendium against the JAX DES Expert Baseline
cd pulse-query-backend && uv run python scripts/evaluate_optimization_models.py
```
