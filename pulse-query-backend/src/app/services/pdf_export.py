"""
Clinical PDF Report Generator for Hospital Shift Handovers and Dashboards.

Generates compliant PDF documents (PDF-1.4 standard) containing hospital metadata,
midnight census timestamps, widget table summaries, and author attribution
without requiring heavy external C-dependencies. Supports dynamic multi-page pagination.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.schemas.json_types import JsonValue, SqlRow


@dataclass(frozen=True, slots=True)
class WidgetPdfSnapshot:
  """
  Strongly typed snapshot of a dashboard widget for PDF report rendering.

  Attributes:
      title (str): Display title of the widget.
      subtitle (str | None): Optional subtitle or caption describing the widget.
      type (str): Widget execution type (`'SQL'`, `'HTTP'`, `'TEXT'`).
      data (Sequence[SqlRow]): Tabular rows executed for the widget.
      error (str | None): Optional error message if widget execution failed.
  """

  title: str = "Untitled Widget"
  subtitle: str | None = None
  type: str = "SQL"
  data: Sequence[SqlRow] = field(default_factory=list)
  error: str | None = None


type WidgetPdfInput = WidgetPdfSnapshot | Mapping[str, JsonValue | Sequence[SqlRow]]


def _coerce_widget_snapshot(widget: WidgetPdfInput) -> WidgetPdfSnapshot:
  """
  Normalizes a `WidgetPdfSnapshot` or legacy dictionary snapshot into a `WidgetPdfSnapshot`.

  Args:
      widget (WidgetPdfInput): Widget snapshot instance or dictionary.

  Returns:
      WidgetPdfSnapshot: Normalized immutable widget snapshot.
  """
  if isinstance(widget, WidgetPdfSnapshot):
    return widget
  raw_title = widget.get("title")
  title = str(raw_title) if raw_title is not None else "Untitled Widget"
  raw_sub = widget.get("subtitle")
  subtitle = str(raw_sub).strip() if isinstance(raw_sub, str) and str(raw_sub).strip() else None
  raw_type = widget.get("type")
  w_type = str(raw_type) if raw_type is not None else "SQL"
  raw_data = widget.get("data")
  rows: list[SqlRow] = (
    [{str(k): v for k, v in row.items()} for row in raw_data if isinstance(row, dict)]
    if isinstance(raw_data, Sequence) and not isinstance(raw_data, (str, bytes))
    else []
  )
  raw_err = widget.get("error")
  err = str(raw_err) if raw_err else None
  return WidgetPdfSnapshot(title=title, subtitle=subtitle, type=w_type, data=rows, error=err)


def _escape_pdf_text(text: str) -> str:
  """
  Escapes special characters in PDF string literals.

  Args:
      text (str): Input text string.

  Returns:
      str: Escaped string safe for PDF text objects.
  """
  cleaned = (
    text.replace(chr(92), chr(92) + chr(92)).replace(chr(40), chr(92) + chr(40)).replace(chr(41), chr(92) + chr(41))
  )
  return "".join(c if ord(c) < 128 else "?" for c in cleaned)


def _build_page_header(
  dashboard_name: str,
  author_email: str,
  formatted_time: str,
  page_index: int,
) -> tuple[list[str], int]:
  """
  Builds drawing commands for the page header and returns initial content y-coordinate.

  Args:
      dashboard_name (str): Title of the exported dashboard.
      author_email (str): Email of exporting user.
      formatted_time (str): Formatted census timestamp string.
      page_index (int): Zero-based index of current page.

  Returns:
      tuple[list[str], int]: List of PDF drawing commands and initial y_pos.
  """
  commands: list[str] = []
  if page_index == 0:
    escaped_title = _escape_pdf_text(f"Pulse Query Clinical Report: {dashboard_name}")
    commands.append(f"BT /F1 16 Tf 50 740 Td ({escaped_title}) Tj ET")

    escaped_author = _escape_pdf_text(f"Export Author: {author_email}")
    escaped_census = _escape_pdf_text(f"Midnight Census Timestamp: {formatted_time}")
    escaped_facility = _escape_pdf_text("Facility: Stanford Health Care - Clinical Analytics Operations")

    commands.append(f"BT /F1 10 Tf 50 715 Td ({escaped_facility}) Tj ET")
    commands.append(f"BT /F1 10 Tf 50 700 Td ({escaped_census}) Tj ET")
    commands.append(f"BT /F1 10 Tf 50 685 Td ({escaped_author}) Tj ET")
    commands.append("50 675 m 562 675 l S")
    return commands, 655
  escaped_title = _escape_pdf_text(f"Pulse Query Clinical Report: {dashboard_name} (Cont.)")
  commands.append(f"BT /F1 14 Tf 50 740 Td ({escaped_title}) Tj ET")
  escaped_census = _escape_pdf_text(f"Midnight Census: {formatted_time}")
  commands.append(f"BT /F1 9 Tf 50 720 Td ({escaped_census}) Tj ET")
  commands.append("50 710 m 562 710 l S")
  return commands, 690


def _build_page_footer(
  formatted_time: str,
  page_index: int,
  total_pages: int,
) -> list[str]:
  """
  Builds drawing commands for the standardized page footer.

  Args:
      formatted_time (str): Formatted timestamp.
      page_index (int): Zero-based page index.
      total_pages (int): Total page count.

  Returns:
      list[str]: PDF commands rendering footer line and pagination info.
  """
  commands: list[str] = ["50 50 m 562 50 l S"]
  escaped_footer = _escape_pdf_text(
    f"Generated by Pulse Query Engine | Page {page_index + 1} of {total_pages} | {formatted_time} | Confidential Clinical Data"
  )
  commands.append(f"BT /F1 8 Tf 50 38 Td ({escaped_footer}) Tj ET")
  return commands


def _render_widget_block(widget: WidgetPdfInput, y_pos: int) -> tuple[list[str], int]:
  """
  Builds PDF drawing commands for a single widget summary block and returns updated `y_pos`.

  Args:
      widget (WidgetPdfInput): Widget snapshot (`WidgetPdfSnapshot` or mapping).
      y_pos (int): Starting vertical coordinate in PDF points.

  Returns:
      tuple[list[str], int]: Tuple of `(pdf_commands, next_y_pos)`.
  """
  snap = _coerce_widget_snapshot(widget)
  cmds: list[str] = []
  escaped_w_title = _escape_pdf_text(f"Widget: {snap.title} [{snap.type}]")
  cmds.append(f"BT /F1 11 Tf 50 {y_pos} Td ({escaped_w_title}) Tj ET")
  y_pos -= 15

  if snap.subtitle:
    escaped_sub = _escape_pdf_text(f"Caption: {snap.subtitle}")
    cmds.append(f"BT /F1 9 Tf 65 {y_pos} Td ({escaped_sub}) Tj ET")
    y_pos -= 13

  if snap.data:
    first_row = snap.data[0]
    col_names = list(first_row.keys())[:5]
    header_str = " | ".join(f"{k}: {first_row[k]}" for k in col_names)
    escaped_row = _escape_pdf_text(f"Sample: {header_str}")
    cmds.append(f"BT /F1 9 Tf 65 {y_pos} Td ({escaped_row}) Tj ET")
    y_pos -= 14
    escaped_summary = _escape_pdf_text(f"Total Records: {len(snap.data)}")
    cmds.append(f"BT /F1 9 Tf 65 {y_pos} Td ({escaped_summary}) Tj ET")
    y_pos -= 16
  elif snap.error:
    escaped_err = _escape_pdf_text(f"Status: Error - {snap.error}")
    cmds.append(f"BT /F1 9 Tf 65 {y_pos} Td ({escaped_err}) Tj ET")
    y_pos -= 16
  else:
    escaped_empty = _escape_pdf_text("Status: No data recorded.")
    cmds.append(f"BT /F1 9 Tf 65 {y_pos} Td ({escaped_empty}) Tj ET")
    y_pos -= 16

  return cmds, y_pos


class PdfDocumentBuilder:
  """
  Deterministic PDF-1.4 document builder that assembles page content streams,
  catalog/font objects, and cross-reference (`xref`) byte-offset tables.
  """

  def __init__(self) -> None:
    """Initializes an empty list of encoded page content streams."""
    self._page_streams: list[bytes] = []

  def add_page_commands(self, commands: Sequence[str]) -> None:
    """
    Encodes a sequence of PDF drawing commands into a Latin-1 page stream.

    Args:
        commands (Sequence[str]): Ordered PDF operators for a single page.
    """
    self._page_streams.append(("\n".join(commands) + "\n").encode("latin1"))

  def build_bytes(self) -> bytes:
    """
    Serializes all added pages into a complete, standards-compliant PDF-1.4 binary stream.

    Returns:
        bytes: Complete PDF document starting with `%PDF-1.4` and ending with `%%EOF`.
    """
    total_pages = len(self._page_streams)
    page_ids = [4 + 2 * i for i in range(total_pages)]
    kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)

    objects: list[bytes] = [
      b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      f"2 0 obj\n<< /Type /Pages /Kids [{kids_str}] /Count {total_pages} >>\nendobj\n".encode("latin1"),
      b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]

    for i, p_bytes in enumerate(self._page_streams):
      page_id = 4 + 2 * i
      content_id = 5 + 2 * i
      p_len = len(p_bytes)

      page_obj = (
        f"{page_id} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        f"/Contents {content_id} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n".encode("latin1")
      )
      content_obj = (
        f"{content_id} 0 obj\n<< /Length {p_len} >>\nstream\n".encode("latin1") + p_bytes + b"\nendstream\nendobj\n"
      )
      objects.append(page_obj)
      objects.append(content_obj)

    header = b"%PDF-1.4\n"
    body = b""
    xref: list[int] = [0]
    offset = len(header)
    for obj in objects:
      xref.append(offset)
      body += obj
      offset += len(obj)

    xref_offset = offset
    xref_table = f"xref\n0 {len(xref)}\n0000000000 65535 f \n".encode("latin1")
    for off in xref[1:]:
      xref_table += f"{off:010d} 00000 n \n".encode("latin1")

    trailer = f"trailer\n<< /Size {len(xref)} /Root 1 0 R >>\nstartxref\\n{xref_offset}\\n%%EOF\\n".replace(
      "\\n", "\n"
    ).encode("latin1")

    return header + body + xref_table + trailer


def generate_clinical_pdf_report(
  dashboard_name: str,
  author_email: str,
  widgets_data: Sequence[WidgetPdfInput],
  census_timestamp: datetime | None = None,
) -> bytes:
  """
  Generates a multi-page clinical PDF report byte stream formatted for hospital shift handovers.

  Args:
      dashboard_name (str): Title of the exported dashboard.
      author_email (str): Email address of clinician or administrator exporting the report.
      widgets_data (Sequence[WidgetPdfInput]): Sequence of widget data snapshots including titles, types, and rows.
      census_timestamp (datetime | None): Optional midnight census timestamp; defaults to current UTC time.

  Returns:
      bytes: Binary stream beginning with '%PDF-1.4' and ending with '%%EOF'.
  """
  if census_timestamp is None:
    census_timestamp = datetime.now(UTC)

  formatted_time = census_timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
  normalized_widgets = [_coerce_widget_snapshot(w) for w in widgets_data]

  pages_widget_groups: list[list[WidgetPdfSnapshot]] = []
  current_group: list[WidgetPdfSnapshot] = []
  current_y = 655

  for widget in normalized_widgets:
    w_height = (45 if widget.data else 31) + (13 if widget.subtitle else 0)

    if current_y - w_height < 80 and current_group:
      pages_widget_groups.append(current_group)
      current_group = [widget]
      current_y = 690 - w_height
    else:
      current_group.append(widget)
      current_y -= w_height

  pages_widget_groups.append(current_group if current_group else [])

  total_pages = len(pages_widget_groups)
  builder = PdfDocumentBuilder()

  for p_idx, group in enumerate(pages_widget_groups):
    header_cmds, y_pos = _build_page_header(dashboard_name, author_email, formatted_time, p_idx)
    cmds = list(header_cmds)

    for widget in group:
      w_cmds, y_pos = _render_widget_block(widget, y_pos)
      cmds.extend(w_cmds)

    cmds.extend(_build_page_footer(formatted_time, p_idx, total_pages))
    builder.add_page_commands(cmds)

  return builder.build_bytes()
