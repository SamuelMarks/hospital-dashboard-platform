"""
Shared JAX + MPAX Linear Programming Solver Wrapper (`mpax_lp_runner.py`).

Centralizes construction and execution of JAX/MPAX primal-dual hybrid gradient (`r2HPDHG`)
linear programming models (`create_lp`) alongside a bounded, thread-safe LRU solution cache
(`ResultCacheService[OptimizationSolutionPayload]`) shared across Use Case 1, Use Case 2,
and Use Case 3 hospital operations solvers.
"""

from __future__ import annotations

from collections.abc import Sequence

import jax.numpy as jnp
from mpax import create_lp, r2HPDHG

from app.schemas.optimization import OptimizationSolutionPayload
from app.services.cache_service import ResultCacheService

_SHARED_MPAX_SOLVER = r2HPDHG(eps_abs=1e-2, eps_rel=1e-2, iteration_limit=150, verbose=False)

optimization_solution_cache: ResultCacheService[OptimizationSolutionPayload] = ResultCacheService()


def solve_mpax_linear_program(
  cost_list: Sequence[float],
  a_rows: Sequence[Sequence[float]],
  b_vals: Sequence[float],
  g_rows: Sequence[Sequence[float]],
  h_vals: Sequence[float],
  l_bounds: Sequence[float],
  u_bounds: Sequence[float],
) -> tuple[list[float], float]:
  """
  Builds and solves a standard-form MPAX linear program using `r2HPDHG`.

  Args:
      cost_list (Sequence[float]): Objective cost coefficients $c$.
      a_rows (Sequence[Sequence[float]]): Equality constraint matrix $A$.
      b_vals (Sequence[float]): Equality right-hand-side vector $b$.
      g_rows (Sequence[Sequence[float]]): Inequality constraint matrix $G$.
      h_vals (Sequence[float]): Inequality right-hand-side vector $h$.
      l_bounds (Sequence[float]): Variable lower bounds $l$.
      u_bounds (Sequence[float]): Variable upper bounds $u$.

  Returns:
      tuple[list[float], float]: `(non_negative_primal_solution, rounded_objective_value)`.
  """
  c_jnp = jnp.asarray(cost_list, dtype=jnp.float32)
  lp = create_lp(
    c_jnp,
    jnp.asarray(a_rows, dtype=jnp.float32),
    jnp.asarray(b_vals, dtype=jnp.float32),
    jnp.asarray(g_rows, dtype=jnp.float32),
    jnp.asarray(h_vals, dtype=jnp.float32),
    jnp.asarray(l_bounds, dtype=jnp.float32),
    jnp.asarray(u_bounds, dtype=jnp.float32),
  )
  result = _SHARED_MPAX_SOLVER.optimize(lp)
  primal = [max(0.0, float(v)) for v in result.primal_solution.tolist()]
  obj_val = round(float(jnp.dot(c_jnp, jnp.asarray(primal, dtype=jnp.float32))), 2)
  return primal, obj_val


__all__ = [
  "optimization_solution_cache",
  "solve_mpax_linear_program",
]
