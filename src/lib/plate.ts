/** Same rule as the database's `plate_key`: uppercase, only digits, Latin and Ethiopic letters. */
export function plateKey(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Zሀ-፿]/g, "");
}
