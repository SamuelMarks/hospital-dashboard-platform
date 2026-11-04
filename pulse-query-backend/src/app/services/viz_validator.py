"""
SQL-to-Visualization Compatibility Validation Service (`viz_validator.py`).

Provides railway-oriented (`AppResult`) validation checking whether an executed
SQL dataset (`columns` and `data` rows) is structurally and numerically applicable
to a requested dashboard visualization representation.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.core.result import AppError, AppResult, Err, ErrorCode, Ok
from app.schemas.json_types import JsonValue
from app.schemas.widget import normalize_visualization_type


@dataclass(frozen=True, slots=True)
class VizCompatibilityReport:
  """
  Immutable report describing whether a SQL dataset is compatible with a visualization.

  Attributes:
      visualization (str): Normalized canonical visualization identifier.
      compatible (bool): Whether the dataset can be validly rendered by `visualization`.
      code (str | None): Machine-readable incompatibility code when `compatible` is False.
      message (str | None): Human-readable explanation when `compatible` is False.
      suggested_visualizations (tuple[str, ...]): Applicable alternative visualization types.
  """

  visualization: str
  compatible: bool
  code: str | None = None
  message: str | None = None
  suggested_visualizations: tuple[str, ...] = ()

  def to_dict(self) -> dict[str, JsonValue]:
    """
    Serializes the compatibility report into a JSON-compatible dictionary.

    Returns:
        dict[str, JsonValue]: Dictionary representation of the report.
    """
    return {
      "visualization": self.visualization,
      "compatible": self.compatible,
      "code": self.code,
      "message": self.message,
      "suggested_visualizations": list(self.suggested_visualizations),
    }


def coerce_finite_float(val: JsonValue) -> float | None:
  """
  Coerces a JSON cell value (int, float, or numeric string) into a finite float, or None.

  Args:
      val (JsonValue): Cell value to inspect.

  Returns:
      float | None: Finite float value, or None if non-numeric or boolean.
  """
  if isinstance(val, bool) or val is None:
    return None
  if isinstance(val, (int, float)):
    f_val = float(val)
    return f_val if f_val == f_val and f_val not in (float("inf"), float("-inf")) else None
  if isinstance(val, str):
    trimmed = val.strip()
    if trimmed.endswith("%"):
      trimmed = trimmed[:-1].strip()
    if not trimmed:
      return None
    try:
      f_val = float(trimmed)
      return f_val if f_val == f_val and f_val not in (float("inf"), float("-inf")) else None
    except ValueError:
      return None
  return None


def _resolve_value_column(
  columns: Sequence[str],
  first_row: Mapping[str, JsonValue],
  config: Mapping[str, JsonValue] | None,
) -> str:
  """
  Resolves the numeric value column (`yKey`) from explicit config or runtime type inspection.

  Args:
      columns (Sequence[str]): Ordered dataset column names.
      first_row (Mapping[str, JsonValue]): First row dictionary of the dataset.
      config (Mapping[str, JsonValue] | None): Optional widget configuration mapping.

  Returns:
      str: Resolved column name for numeric values.
  """
  if config:
    raw_y = config.get("yKey")
    if isinstance(raw_y, str) and raw_y in columns:
      return raw_y
  for col in columns[1:]:
    if coerce_finite_float(first_row.get(col)) is not None:
      return col
  return columns[1]


def _check_missing_axis_override(
  norm_viz: str,
  columns: Sequence[str],
  config: Mapping[str, JsonValue] | None,
) -> AppError | None:
  """
  Checks whether explicit `xKey` or `yKey` overrides in `config` are missing from `columns`.

  Args:
      norm_viz (str): Normalized visualization identifier.
      columns (Sequence[str]): Dataset column names.
      config (Mapping[str, JsonValue] | None): Optional widget configuration mapping.

  Returns:
      AppError | None: Validation error if a configured axis key is missing, else None.
  """
  if not config or norm_viz not in ("pie_chart", "bar_chart", "line_chart", "heatmap"):
    return None
  for axis_field in ("xKey", "yKey"):
    axis_val = config.get(axis_field)
    if isinstance(axis_val, str) and axis_val and axis_val not in columns:
      return AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Configured {axis_field} column '{axis_val}' is not present in SQL result columns.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_MISSING_AXIS_COLUMN", "suggested": ["table"]},
      )
  return None


def _validate_pie_dataset(
  columns: Sequence[str],
  data: Sequence[Mapping[str, JsonValue]],
  config: Mapping[str, JsonValue] | None,
) -> AppResult[VizCompatibilityReport]:
  """
  Validates a SQL dataset for `pie_chart` representation.

  Args:
      columns (Sequence[str]): Dataset column names.
      data (Sequence[Mapping[str, JsonValue]]): Dataset row dictionaries.
      config (Mapping[str, JsonValue] | None): Optional widget configuration mapping.

  Returns:
      AppResult[VizCompatibilityReport]: `Ok(VizCompatibilityReport)` or `Err(AppError)`.
  """
  if len(columns) < 2:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="Pie Chart requires at least 2 columns (category label and numeric value).",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_TOO_FEW_COLUMNS", "suggested": ["metric", "scalar", "table"]},
      )
    )
  if not data:
    return Ok(
      VizCompatibilityReport(visualization="pie_chart", compatible=True, suggested_visualizations=("pie_chart", "table"))
    )

  val_col = _resolve_value_column(columns, data[0], config)
  nums = [n for row in data if (n := coerce_finite_float(row.get(val_col))) is not None]
  if not nums:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Pie Chart requires numeric values, but column '{val_col}' is non-numeric.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_NON_NUMERIC_VALUES", "suggested": ["table"]},
      )
    )
  if any(n < 0 for n in nums):
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Pie Chart cannot represent negative values in column '{val_col}'.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_NEGATIVE_VALUES_FOR_PIE", "suggested": ["bar_chart", "table"]},
      )
    )
  if sum(nums) <= 0:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Pie Chart requires a positive sum of values in column '{val_col}'.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_ZERO_TOTAL_FOR_PIE", "suggested": ["table", "bar_chart"]},
      )
    )
  return Ok(
    VizCompatibilityReport(
      visualization="pie_chart", compatible=True, suggested_visualizations=("pie_chart", "bar_chart", "table")
    )
  )


def _validate_xy_chart_dataset(
  norm_viz: str,
  columns: Sequence[str],
  data: Sequence[Mapping[str, JsonValue]],
  config: Mapping[str, JsonValue] | None,
) -> AppResult[VizCompatibilityReport]:
  """
  Validates a SQL dataset for `bar_chart` or `line_chart` representation.

  Args:
      norm_viz (str): `'bar_chart'` or `'line_chart'`.
      columns (Sequence[str]): Dataset column names.
      data (Sequence[Mapping[str, JsonValue]]): Dataset row dictionaries.
      config (Mapping[str, JsonValue] | None): Optional widget configuration mapping.

  Returns:
      AppResult[VizCompatibilityReport]: `Ok(VizCompatibilityReport)` or `Err(AppError)`.
  """
  if len(columns) < 2:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"{norm_viz} requires at least 2 columns (X-axis and numeric Y-axis).",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_TOO_FEW_COLUMNS", "suggested": ["metric", "scalar", "table"]},
      )
    )
  if not data:
    return Ok(
      VizCompatibilityReport(visualization=norm_viz, compatible=True, suggested_visualizations=(norm_viz, "table"))
    )

  val_col = _resolve_value_column(columns, data[0], config)
  if not any(coerce_finite_float(row.get(val_col)) is not None for row in data):
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"{norm_viz} requires a numeric Y-axis column, but '{val_col}' is non-numeric.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_NON_NUMERIC_Y_AXIS", "suggested": ["table"]},
      )
    )
  if norm_viz == "line_chart" and len(data) < 2:
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="Line Chart requires at least 2 data rows to plot a trend.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_SINGLE_ROW_FOR_LINE", "suggested": ["metric", "scalar", "bar_chart", "table"]},
      )
    )
  return Ok(VizCompatibilityReport(visualization=norm_viz, compatible=True, suggested_visualizations=(norm_viz, "table")))


def _validate_heatmap_dataset(
  columns: Sequence[str],
  data: Sequence[Mapping[str, JsonValue]],
  config: Mapping[str, JsonValue] | None,
) -> AppResult[VizCompatibilityReport]:
  """
  Validates a SQL dataset for `heatmap` representation (requires >= 3 columns and numeric intensity).

  Args:
      columns (Sequence[str]): Dataset column names.
      data (Sequence[Mapping[str, JsonValue]]): Dataset row dictionaries.
      config (Mapping[str, JsonValue] | None): Optional widget configuration mapping.

  Returns:
      AppResult[VizCompatibilityReport]: `Ok(VizCompatibilityReport)` or `Err(AppError)`.
  """
  if len(columns) < 3:
    suggested: list[JsonValue] = (
      ["bar_chart", "pie_chart", "table"] if len(columns) == 2 else ["metric", "scalar", "table"]
    )
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="Heatmap requires at least 3 columns (Y category, X bucket, and numeric intensity).",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_HEATMAP_DIMENSIONS", "suggested": suggested},
      )
    )
  if not data:
    return Ok(
      VizCompatibilityReport(visualization="heatmap", compatible=True, suggested_visualizations=("heatmap", "table"))
    )

  raw_y = config.get("yKey") if config else None
  val_col = (
    raw_y
    if isinstance(raw_y, str) and raw_y in columns
    else next((c for c in columns if c.lower() == "net_bottleneck"), columns[-1] if len(columns) > 3 else columns[2])
  )
  if not any(coerce_finite_float(row.get(val_col)) is not None for row in data):
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Heatmap requires numeric intensity values in column '{val_col}'.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_NON_NUMERIC_VALUES", "suggested": ["table"]},
      )
    )
  return Ok(
    VizCompatibilityReport(visualization="heatmap", compatible=True, suggested_visualizations=("heatmap", "table"))
  )


def _validate_scalar_dataset(
  data: Sequence[Mapping[str, JsonValue]],
) -> AppResult[VizCompatibilityReport]:
  """
  Validates a SQL dataset for `scalar` representation (requires a numeric value in row 0).

  Args:
      data (Sequence[Mapping[str, JsonValue]]): Dataset row dictionaries.

  Returns:
      AppResult[VizCompatibilityReport]: `Ok(VizCompatibilityReport)` or `Err(AppError)`.
  """
  if data and not any(coerce_finite_float(v) is not None for v in data[0].values()):
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="Scalar Gauge requires at least one numeric value in the first row.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_NON_NUMERIC_SCALAR", "suggested": ["table"]},
      )
    )
  return Ok(
    VizCompatibilityReport(
      visualization="scalar", compatible=True, suggested_visualizations=("scalar", "metric", "table")
    )
  )


def validate_sql_dataset_for_visualization(
  visualization: str | None,
  columns: Sequence[str],
  data: Sequence[Mapping[str, JsonValue]],
  config: Mapping[str, JsonValue] | None = None,
  widget_type: str | None = "SQL",
) -> AppResult[VizCompatibilityReport]:
  """
  Validates whether an executed SQL dataset (`columns`, `data`) is applicable to `visualization`.

  Args:
      visualization (str | None): Target visualization identifier.
      columns (Sequence[str]): Ordered list of SQL result column names.
      data (Sequence[Mapping[str, JsonValue]]): List of row dictionaries returned by the query.
      config (Mapping[str, JsonValue] | None): Optional widget configuration (`xKey`, `yKey`).
      widget_type (str | None): Optional widget source type (`'SQL'`, `'HTTP'`, `'TEXT'`).

  Returns:
      AppResult[VizCompatibilityReport]: `Ok(VizCompatibilityReport)` when compatible, or
          `Err(AppError)` with `ErrorCode.VALIDATION_ERROR` and structured `details` when incompatible.
  """
  norm_viz = normalize_visualization_type(visualization, widget_type)
  if norm_viz == "unknown":
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"Unsupported visualization type: {visualization}",
        status_code=400,
        details={"viz_code": "UNKNOWN_VISUALIZATION_TYPE", "suggested": ["table"]},
      )
    )

  if isinstance(widget_type, str) and widget_type.strip().upper() == "TEXT":
    return Ok(VizCompatibilityReport(visualization="markdown", compatible=True, suggested_visualizations=("markdown",)))

  if norm_viz == "markdown":
    return Err(
      AppError(
        code=ErrorCode.VALIDATION_ERROR,
        message="Markdown visualization is not applicable to SQL query results.",
        status_code=400,
        details={"viz_code": "INCOMPATIBLE_SQL_FOR_MARKDOWN", "suggested": ["table", "metric"]},
      )
    )

  if not columns:
    return Ok(VizCompatibilityReport(visualization=norm_viz, compatible=True, suggested_visualizations=(norm_viz,)))

  axis_err = _check_missing_axis_override(norm_viz, columns, config)
  if axis_err is not None:
    return Err(axis_err)

  if norm_viz == "pie_chart":
    return _validate_pie_dataset(columns, data, config)
  if norm_viz in ("bar_chart", "line_chart"):
    return _validate_xy_chart_dataset(norm_viz, columns, data, config)
  if norm_viz == "heatmap":
    return _validate_heatmap_dataset(columns, data, config)
  if norm_viz == "scalar":
    return _validate_scalar_dataset(data)

  return Ok(VizCompatibilityReport(visualization=norm_viz, compatible=True, suggested_visualizations=(norm_viz, "table")))
