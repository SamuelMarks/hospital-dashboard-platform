"""
Unit tests for `app.services.viz_validator` and `normalize_visualization_type`.
"""

from __future__ import annotations

from app.core.result import Err, Ok
from app.schemas.widget import normalize_visualization_type
from app.services.viz_validator import (
  VizCompatibilityReport,
  coerce_finite_float,
  validate_sql_dataset_for_visualization,
)


def test_normalize_visualization_type() -> None:
  """Verifies canonical visualization normalization across aliases and widget types."""
  assert normalize_visualization_type("table", "TEXT") == "markdown"
  assert normalize_visualization_type(None) == "table"
  assert normalize_visualization_type("   ") == "table"
  assert normalize_visualization_type("pie") == "pie_chart"
  assert normalize_visualization_type("pie_chart") == "pie_chart"
  assert normalize_visualization_type("donut") == "pie_chart"
  assert normalize_visualization_type("bar") == "bar_chart"
  assert normalize_visualization_type("barchart") == "bar_chart"
  assert normalize_visualization_type("bar_chart") == "bar_chart"
  assert normalize_visualization_type("line") == "line_chart"
  assert normalize_visualization_type("linechart") == "line_chart"
  assert normalize_visualization_type("line_chart") == "line_chart"
  assert normalize_visualization_type("line_graph") == "line_chart"
  assert normalize_visualization_type("heatmap") == "heatmap"
  assert normalize_visualization_type("matrix") == "heatmap"
  assert normalize_visualization_type("metric") == "metric"
  assert normalize_visualization_type("kpi") == "metric"
  assert normalize_visualization_type("scalar") == "scalar"
  assert normalize_visualization_type("gauge") == "scalar"
  assert normalize_visualization_type("markdown") == "markdown"
  assert normalize_visualization_type("text") == "markdown"
  assert normalize_visualization_type("note") == "markdown"
  assert normalize_visualization_type("3d_vr") == "unknown"


def test_coerce_finite_float() -> None:
  """Verifies numeric coercion for ints, floats, strings, percentages, booleans, and invalid values."""
  assert coerce_finite_float(42) == 42.0
  assert coerce_finite_float(-3.5) == -3.5
  assert coerce_finite_float(float("nan")) is None
  assert coerce_finite_float(float("inf")) is None
  assert coerce_finite_float(" 91.5 ") == 91.5
  assert coerce_finite_float("-12.4%") == -12.4
  assert coerce_finite_float("   ") is None
  assert coerce_finite_float("%") is None
  assert coerce_finite_float("not-a-number") is None
  assert coerce_finite_float(True) is None
  assert coerce_finite_float(None) is None
  assert coerce_finite_float([1, 2]) is None


def test_validate_sql_dataset_general_and_axes() -> None:
  """Verifies unknown visualization, TEXT widget, markdown on SQL, empty columns, and missing axis keys."""
  res_unknown = validate_sql_dataset_for_visualization("3d_hologram", ["a"], [{"a": 1}])
  assert isinstance(res_unknown, Err)
  assert res_unknown.error.details["viz_code"] == "UNKNOWN_VISUALIZATION_TYPE"

  res_text = validate_sql_dataset_for_visualization("table", [], [], widget_type="TEXT")
  assert isinstance(res_text, Ok)
  assert res_text.value.visualization == "markdown"
  assert res_text.value.to_dict()["compatible"] is True

  res_md_sql = validate_sql_dataset_for_visualization("markdown", ["a"], [{"a": 1}], widget_type="SQL")
  assert isinstance(res_md_sql, Err)
  assert res_md_sql.error.details["viz_code"] == "INCOMPATIBLE_SQL_FOR_MARKDOWN"

  res_empty_cols = validate_sql_dataset_for_visualization("pie_chart", [], [])
  assert isinstance(res_empty_cols, Ok)
  assert res_empty_cols.value.compatible is True

  res_missing_x = validate_sql_dataset_for_visualization(
    "bar_chart",
    ["unit", "cnt"],
    [{"unit": "ICU", "cnt": 10}],
    config={"xKey": "missing_col"},
  )
  assert isinstance(res_missing_x, Err)
  assert res_missing_x.error.details["viz_code"] == "INCOMPATIBLE_MISSING_AXIS_COLUMN"


def test_validate_sql_dataset_pie_chart() -> None:
  """Verifies all pie_chart compatibility and incompatibility rules."""
  res_1col = validate_sql_dataset_for_visualization("pie", ["cnt"], [{"cnt": 10}])
  assert isinstance(res_1col, Err)
  assert res_1col.error.details["viz_code"] == "INCOMPATIBLE_TOO_FEW_COLUMNS"

  res_empty_rows = validate_sql_dataset_for_visualization("pie_chart", ["svc", "cnt"], [])
  assert isinstance(res_empty_rows, Ok)

  res_non_num = validate_sql_dataset_for_visualization(
    "pie_chart",
    ["svc", "label"],
    [{"svc": "ICU", "label": "North"}],
  )
  assert isinstance(res_non_num, Err)
  assert res_non_num.error.details["viz_code"] == "INCOMPATIBLE_NON_NUMERIC_VALUES"

  res_neg = validate_sql_dataset_for_visualization(
    "pie_chart",
    ["svc", "delta"],
    [{"svc": "ICU", "delta": 10}, {"svc": "ER", "delta": -2}],
  )
  assert isinstance(res_neg, Err)
  assert res_neg.error.details["viz_code"] == "INCOMPATIBLE_NEGATIVE_VALUES_FOR_PIE"

  res_zero = validate_sql_dataset_for_visualization(
    "pie_chart",
    ["svc", "cnt"],
    [{"svc": "ICU", "cnt": 0}],
  )
  assert isinstance(res_zero, Err)
  assert res_zero.error.details["viz_code"] == "INCOMPATIBLE_ZERO_TOTAL_FOR_PIE"

  res_ok = validate_sql_dataset_for_visualization(
    "pie_chart",
    ["svc", "cnt"],
    [{"svc": "ICU", "cnt": 25}, {"svc": "ER", "cnt": 75}],
    config={"yKey": "cnt"},
  )
  assert isinstance(res_ok, Ok)
  assert isinstance(res_ok.value, VizCompatibilityReport)

  res_ok_x_only = validate_sql_dataset_for_visualization(
    "pie_chart",
    ["svc", "cnt"],
    [{"svc": "ICU", "cnt": 25}, {"svc": "ER", "cnt": 75}],
    config={"xKey": "svc"},
  )
  assert isinstance(res_ok_x_only, Ok)


def test_validate_sql_dataset_bar_line_heatmap_scalar_table() -> None:
  """Verifies bar_chart, line_chart, heatmap, scalar, metric, and table validation rules."""
  # Bar / Line < 2 columns
  res_bar_1col = validate_sql_dataset_for_visualization("bar_chart", ["cnt"], [{"cnt": 5}])
  assert isinstance(res_bar_1col, Err)
  assert res_bar_1col.error.details["viz_code"] == "INCOMPATIBLE_TOO_FEW_COLUMNS"

  # Empty data on bar_chart
  assert isinstance(validate_sql_dataset_for_visualization("bar_chart", ["x", "y"], []), Ok)

  # Non-numeric Y on bar_chart
  res_bar_text = validate_sql_dataset_for_visualization("bar_chart", ["x", "y"], [{"x": "A", "y": "text"}])
  assert isinstance(res_bar_text, Err)
  assert res_bar_text.error.details["viz_code"] == "INCOMPATIBLE_NON_NUMERIC_Y_AXIS"

  # Line chart with 1 row fails, 2 rows succeeds
  res_line_1row = validate_sql_dataset_for_visualization("line_chart", ["x", "y"], [{"x": "D1", "y": 10}])
  assert isinstance(res_line_1row, Err)
  assert res_line_1row.error.details["viz_code"] == "INCOMPATIBLE_SINGLE_ROW_FOR_LINE"

  res_line_2rows = validate_sql_dataset_for_visualization(
    "line_chart",
    ["x", "y"],
    [{"x": "D1", "y": 10}, {"x": "D2", "y": 20}],
  )
  assert isinstance(res_line_2rows, Ok)

  # Heatmap < 3 columns (1 col and 2 cols)
  res_hm_1 = validate_sql_dataset_for_visualization("heatmap", ["a"], [{"a": 1}])
  assert isinstance(res_hm_1, Err)
  assert res_hm_1.error.details["viz_code"] == "INCOMPATIBLE_HEATMAP_DIMENSIONS"

  res_hm_2 = validate_sql_dataset_for_visualization("heatmap", ["a", "b"], [{"a": "X", "b": 1}])
  assert isinstance(res_hm_2, Err)

  # Heatmap empty data
  assert isinstance(validate_sql_dataset_for_visualization("heatmap", ["a", "b", "c"], []), Ok)

  # Heatmap non-numeric intensity
  res_hm_text = validate_sql_dataset_for_visualization(
    "heatmap",
    ["svc", "hr", "load"],
    [{"svc": "ICU", "hr": 1, "load": "bad"}],
  )
  assert isinstance(res_hm_text, Err)
  assert res_hm_text.error.details["viz_code"] == "INCOMPATIBLE_NON_NUMERIC_VALUES"

  # Heatmap valid with >3 columns and explicit yKey
  res_hm_ok = validate_sql_dataset_for_visualization(
    "heatmap",
    ["svc", "hr", "admits", "score"],
    [{"svc": "ICU", "hr": 1, "admits": 4, "score": 9}],
    config={"yKey": "score"},
  )
  assert isinstance(res_hm_ok, Ok)

  # Scalar non-numeric vs numeric
  res_scalar_bad = validate_sql_dataset_for_visualization(
    "scalar",
    ["dt"],
    [{"dt": "2026-10-01"}],
  )
  assert isinstance(res_scalar_bad, Err)
  assert res_scalar_bad.error.details["viz_code"] == "INCOMPATIBLE_NON_NUMERIC_SCALAR"

  res_scalar_ok = validate_sql_dataset_for_visualization("scalar", ["prob"], [{"prob": 0.92}])
  assert isinstance(res_scalar_ok, Ok)

  # Metric & Table
  assert isinstance(validate_sql_dataset_for_visualization("metric", ["cnt"], [{"cnt": 10}]), Ok)
  assert isinstance(validate_sql_dataset_for_visualization("table", ["cnt"], [{"cnt": 10}]), Ok)
