import { formatSymbol } from "./currency";

export function money(value: string | number | null | undefined): string {
  const num = typeof value === "string" ? Number(value) : value ?? 0;
  return formatSymbol(num);
}

export function dateOnly(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString();
}
