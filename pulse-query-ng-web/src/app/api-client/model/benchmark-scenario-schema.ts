/**
 * @fileoverview Generated OpenAPI model interface for Hospital Analytics Platform.
 */

/**
 * Strongly typed OpenAPI schema for a Text-to-SQL or MPAX What-If benchmark scenario entry.
 */
export interface BenchmarkScenarioSchema {
  /** Optional scenario UUID string. */
  id?: string | null;
  /** Analytical or clinical optimization theme name. */
  theme: string;
  /** Natural language clinical question (SQL benchmark). */
  question: string;
  /** Ground-truth DuckDB SQL query (SQL benchmark). */
  gold_sql: string;
  /** Complexity tier ('Low', 'Medium', 'High', 'Easy', 'Hard'). */
  complexity: string;
  /** Natural language scenario prompt (MPAX benchmark). */
  prompt: string;
  /** Optional scenario identifier or summary label. */
  scenario?: string | null;
  /** List of clinical service demand objects. */
  demand_data: { Service: string; Count: number }[];
  /** Unit capacity dictionary. */
  base_capacity: Record<string, number>;
  /** Expected demand/capacity/overflow metrics. */
  expected_metrics: {
    /** Property `total_demand`. */
    total_demand: number;
    /** Property `total_capacity`. */
    total_capacity: number;
    /** Property `expected_overflow`. */
    expected_overflow: number;
    /** Property `is_feasible`. */
    is_feasible: boolean;
  };
}
