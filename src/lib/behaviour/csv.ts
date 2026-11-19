/**
 * RFC 4180 CSV with spreadsheet formula-injection protection. A text cell that starts with
 * `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` so spreadsheet software shows
 * it as text instead of evaluating it (OWASP "CSV Injection").
 */

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const safe = FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/** A filename-safe slug of a study title. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "study";
}
