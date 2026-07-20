import { emitDashboardAudit } from "./api";

export type CsvCell = string | number | boolean | null | undefined;

export function csvRow(cells: readonly CsvCell[]): string {
  return cells
    .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
    .join(",");
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

export function csvRowsToObjects(
  rows: string[][],
): Array<Record<string, string>> {
  const [headers, ...bodyRows] = rows;
  if (!headers) {
    return [];
  }

  const normalizedHeaders = headers.map((header) =>
    header
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_"),
  );

  return bodyRows.map((bodyRow) =>
    Object.fromEntries(
      normalizedHeaders.map((header, index) => [
        header,
        bodyRow[index]?.trim() ?? "",
      ]),
    ),
  );
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
  void emitDashboardAudit({
    action: "dashboard.export.download",
    resource_type: "report",
    resource_id: link.download,
    metadata: {
      filename: link.download,
      format: "csv",
      record_count: rows.length,
    },
  }).catch(() => undefined);
}
