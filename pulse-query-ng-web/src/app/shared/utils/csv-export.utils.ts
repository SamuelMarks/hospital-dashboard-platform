/**
 * Serializes tabular rows and column headers into an RFC 4180 compliant CSV string.
 *
 * @fileoverview Shared CSV serialization and browser Blob download utilities.
 * @param rows - Array of row record dictionaries.
 * @param columns - Optional ordered column header list; inferred from `rows[0]` when omitted.
 * @returns Escaped CSV content string, or an empty string when `rows` is empty.
 */
export function serializeTableToCsv(
  rows: readonly Record<string, unknown>[],
  columns?: readonly string[],
): string {
  const firstRow = rows?.[0];
  if (!firstRow) {
    return '';
  }
  const resolvedCols = columns && columns.length > 0 ? columns : Object.keys(firstRow);
  if (resolvedCols.length === 0) {
    return '';
  }

  const csvRows: string[] = [resolvedCols.join(',')];
  for (const row of rows) {
    const values = resolvedCols.map((col) => {
      const val = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join(String.fromCharCode(10));
}

/**
 * Triggers a browser file download for a `Blob` using a temporary DOM anchor element.
 *
 * @param doc - Active DOM `Document` instance.
 * @param blob - Binary or text `Blob` payload to download.
 * @param filename - Target download filename.
 * @param appendToBody - Whether to temporarily append the anchor to `doc.body` before clicking.
 */
export function triggerBlobDownload(
  doc: Document,
  blob: Blob,
  filename: string,
  appendToBody = false,
): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  if (appendToBody && doc.body) {
    doc.body.appendChild(anchor);
    anchor.click();
    doc.body.removeChild(anchor);
  } else {
    anchor.click();
  }
  URL.revokeObjectURL(objectUrl);
}
