/** Reads a typed birr amount ("1,250.50" or "1250"); null unless it is above 0 with at most 2 decimals. */
export function parsePayAmount(raw: string): number | null {
  const clean = raw.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return value > 0 && value <= 100_000_000 ? value : null;
}
