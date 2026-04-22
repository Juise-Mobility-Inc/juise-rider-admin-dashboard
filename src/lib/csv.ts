export type CsvCell = string | number | boolean | null | undefined;

export function csvRow(cells: readonly CsvCell[]): string {
  return cells
    .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
    .join(",");
}

export function csvObjectRow<Column extends string>(
  columns: readonly Column[],
  row: Partial<Record<Column, CsvCell>>,
): CsvCell[] {
  return columns.map((column) => row[column] ?? "");
}

export function sanitizeCsvFilename(
  value: string,
  fallback = "export",
): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized || fallback;

  return `${base}.csv`;
}

export function downloadCsv(
  filename: string,
  rows: ReadonlyArray<readonly CsvCell[]>,
): void {
  const csv = rows.map((row) => csvRow(row)).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}
