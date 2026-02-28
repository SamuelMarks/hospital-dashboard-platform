# MPAX & LLM Arena Integration

The Pulse Query platform natively integrates **MPAX**, a JAX-based mathematical optimization solver, into the Multi-LLM Arena. This allows us to compare deterministic "Symbolic AI" (linear programming) against Generative AI (LLMs) across five distinct "What-If" evaluation modes.

## The 5 Integration Modes

### 1. MPAX as Ground Truth Judge

**Concept:** Evaluate an LLM's raw math and logic capabilities against a deterministic solver.
**Workflow:**

- The user provides a scenario (e.g., "15 Cardiac patients, 10 MedSurg beds").
- The system simultaneously asks the LLMs to calculate the routing and runs MPAX.
- The Arena displays the LLMs' answers alongside the MPAX "Gold Standard" baseline.

### 2. LLMs as Translators

**Concept:** Test an LLM's ability to interpret dense mathematical output and perform clinical data storytelling.
**Workflow:**

- The system runs an MPAX simulation based on the user's prompt.
- The resulting tabular data (overflows, assignments) is injected into the LLMs' system prompt.
- The LLMs generate a human-readable clinical briefing.
- The Arena compares which LLM generated the most accurate and actionable summary.

### 3. LLMs Generating Constraints

**Concept:** Use Natural Language to dynamically program constraints for the mathematical solver.
**Workflow:**

- The user describes a hypothetical crisis ("Flu outbreak drops staff by 30%").
- The LLMs translate this into a JSON structure representing `capacity_parameters`.
- The system executes a distinct MPAX run for each LLM's generated constraints.
- The Arena displays the resulting MPAX simulations side-by-side.

### 4. Rule-Based SQL vs. Global Optimization

**Concept:** Pit SQL heuristics against Linear Programming.
**Workflow:**

- The user asks for a patient routing query.
- The LLM writes standard DuckDB SQL using `CASE WHEN` statements to guess routing.
- The system executes this SQL _and_ runs a true MPAX global optimization on the same underlying data.
- The Arena contrasts the rigid SQL heuristic against the optimal LP routing.

### 5. Feedback Critic (Iterative Planning)

**Concept:** MPAX scores and validates high-level policies suggested by LLMs.
**Workflow:**

- The user asks for a hospital routing policy.
- The LLM suggests a policy (and an accompanying JSON constraint payload).
- MPAX runs the payload and calculates a "Feasibility Score" (e.g., total patient overflow).
- The Arena displays the LLM's text, annotated with its MPAX Validation Score.

## Architecture

These modes are implemented in the `MpaxArenaService` and exposed via the `/api/v1/mpax_arena` endpoint. The frontend `ConversationComponent` detects the selected mode and delegates execution accordingly.
