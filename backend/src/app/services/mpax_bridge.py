"""
MPAX Bridge Service.

This module provides the core logic to translate high-level hospital optimization requests
(JSON Data) into Mathematical Linear Programming formulations solvable by the MPAX/JAX engine.
"""

import json
import logging
import jax
import jax.numpy as jnp
import numpy as np
from typing import Dict, Any, List, Optional
from mpax import create_lp, r2HPDHG

# Enable 64-bit precision for optimization numerical stability
jax.config.update("jax_enable_x64", True)

logger = logging.getLogger("mpax_bridge")


class MpaxBridgeService:
  """
  Service responsible for orchestrating the Linear Programming optimization using MPAX.

  It accepts raw JSON strings describing Demand, Capacity, and Affinities, constructs
  the constraint matrices (A, G) and vectors (b, h, c), and formats the solution
  back into a readable JSON structure.
  """

  def _get_var_index(self, s_idx: int, u_idx: int, num_units: int) -> int:
    """
    Calculate the flattened variable index for a given Service-Unit pair.

    Args:
        s_idx: The index of the Clinical Service (row equivalent).
        u_idx: The index of the Hospital Unit (column equivalent).
        num_units: The total number of units (width of the matrix).

    Returns:
        The integer index in the flattened solution vector.
    """
    return s_idx * num_units + u_idx

  def solve_unit_assignment(
    self,
    demand_json: str,
    capacity_json: str,
    affinity_json: str,
    constraints_json: Optional[str] = None,
  ) -> str:
    """
    Execute the Service-Unit Assignment optimization.

    This function maps to a DuckDB User Defined Function (UDF). It acts as a
    serialization boundary between the Database (Strings) and the Solver (Tensors).

    Problem Formulation:
        Minimize Cost c^T x
        Subject to:
        Ax = b  (Demand constraints: Sum of allocations for service must equal demand)
        Gx >= h (Capacity constraints: Sum of allocations for unit must not exceed capacity)
        l <= x <= h (Non-negativity and forced assignments)

    Args:
        demand_json: JSON string mapping Service Name to Patient Count.
                     Example: '{"Cardiology": 10, "Neurology": 5}'
        capacity_json: JSON string mapping Unit Name to Bed Count.
                       Example: '{"ICU_A": 8, "PCU_B": 12}'
        affinity_json: JSON string mapping Service -> Unit -> Score (0.0 to 1.0).
                       Higher scores indicate better clinical fit.
                       Example: '{"Cardiology": {"ICU_A": 1.0, "PCU_B": 0.5}}'
        constraints_json: Optional JSON list of specific rules (e.g., forcing flow).
                          Example: '[{"type": "force_flow", "service": "X", "unit": "Y", "min": 5}]'

    Returns:
        A JSON string containing a list of optimal assignments.
        On error, returns a JSON object with an "error" key.
    """
    try:
      # 1. Parse Inputs from JSON
      demands: Dict[str, float] = json.loads(demand_json)
      capacities: Dict[str, float] = json.loads(capacity_json)
      affinities: Dict[str, Dict[str, float]] = json.loads(affinity_json)
      constraints: List[Dict[str, Any]] = json.loads(constraints_json) if constraints_json else []

      # 2. Extract Dimensions and Indexes
      services = list(demands.keys())
      units = list(capacities.keys())
      num_services = len(services)
      num_units = len(units)
      num_vars = num_services * num_units

      if num_vars == 0:
        logger.warning("Optimization input dimensions are zero.")
        return json.dumps([])

      # 3. Build Cost Vector 'c' (Minimize negative affinity to maximize fit)
      # The solver minimizes c^T x. To maximize affinity, we use cost = -1 * affinity.
      c_list = []
      for s in services:
        for u in units:
          # Default neutral affinity 0.5 if missing in map
          val = affinities.get(s, {}).get(u, 0.5)
          c_list.append(-1.0 * val)

      c = jnp.array(c_list)

      # 4. Equality Constraints (Ax = b) -> Meet Service Demand
      # For each service i: sum(x_{i,j} for all j) = Demand_i
      A_rows = []
      b_vals = []
      for s_idx, service in enumerate(services):
        row = np.zeros(num_vars)
        for u_idx in range(num_units):
          idx = self._get_var_index(s_idx, u_idx, num_units)
          row[idx] = 1.0
        A_rows.append(row)
        b_vals.append(demands[service])

      A = jnp.array(np.vstack(A_rows))
      b = jnp.array(b_vals)

      # 5. Inequality Constraints (Gx >= h) -> Enforce Unit Capacity
      # Standard form: Gx >= h.
      # Logic: Sum(x_{i,j} for all i) <= Capacity_j
      # Transformation: -Sum(x) >= -Capacity_j
      G_rows = []
      h_vals = []
      for u_idx, unit in enumerate(units):
        row = np.zeros(num_vars)
        for s_idx in range(num_services):
          idx = self._get_var_index(s_idx, u_idx, num_units)
          row[idx] = -1.0
        G_rows.append(row)
        h_vals.append(-1.0 * capacities[unit])

      G = jnp.array(np.vstack(G_rows))
      h = jnp.array(h_vals)

      # 6. Variable Bounds (l <= x <= u) -> Non-negativity
      l = jnp.zeros(num_vars)
      u = jnp.full(num_vars, jnp.inf)

      # 7. Apply Custom "Hard" Constraints Logic (e.g. from LLM actions)
      # Example: "Place at least 5 Geology patients in Unit A" -> modify 'l' bound
      for rule in constraints:
        if rule.get("type") == "force_flow":
          s_name = rule.get("service")
          u_name = rule.get("unit")
          if s_name in services and u_name in units:
            s_idx = services.index(s_name)
            u_idx = units.index(u_name)
            idx = self._get_var_index(s_idx, u_idx, num_units)

            if "min" in rule:
              l = l.at[idx].set(float(rule["min"]))
            if "max" in rule:
              u = u.at[idx].set(float(rule["max"]))

      # 8. Create and Solve LP
      # We explicitly use dense matrices here for simplicity in conversion,
      # though MPAX supports sparse formats for larger datasets.
      lp = create_lp(c, A, b, G, h, l, u, use_sparse_matrix=False)

      # r2HPDHG: Reflected Restarted Halpern Primal-Dual Hybrid Gradient
      solver = r2HPDHG(eps_abs=1e-3, eps_rel=1e-3, verbose=False, jit=True)
      result = solver.optimize(lp)

      # 9. Format Output
      # Convert JAX array to numpy for processing
      solution_flat = np.array(result.primal_solution)
      assignments = []

      for s_idx, service in enumerate(services):
        for u_idx, unit in enumerate(units):
          idx = self._get_var_index(s_idx, u_idx, num_units)
          val = float(solution_flat[idx])
          # Filter out numerical noise (e.g. 1e-12)
          if val > 0.1:
            assignments.append(
              {
                "Service": service,
                "Unit": unit,
                "Patient_Count": round(val, 2),
              }
            )

      return json.dumps(assignments)

    except Exception as e:
      logger.error(f"Optimization Failure: {e}", exc_info=True)
      return json.dumps({"error": str(e)})


# Singleton instance to be imported by DuckDB initializer or API routes
mpax_bridge = MpaxBridgeService()
