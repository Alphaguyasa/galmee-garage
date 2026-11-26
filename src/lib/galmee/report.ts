/**
 * Galmee kit: report definitions, tiles and fetching.
 *
 * The kit renders; apps own the SQL. An app registers 2-4 `ReportDef`s over its own
 * read-only, security-invoker views (or `*_report(p_from, p_to)` RPCs). RLS does the tenant
 * filtering: the kit adds no tenant predicate and never writes.
 * Copy with `eth-calendar.ts` and `period-picker.ts` unchanged.
 */

import { formatEthDay, type EthLang, type Period } from "./eth-calendar";

export type LocalizedString = Record<EthLang, string>;
export type ReportRow = Record<string, unknown>;

export type ReportTile = {
  key: string;
  label: LocalizedString;
  agg: "sum" | "count" | "avg";
  /** Column summed or averaged; not needed for count. */
  col?: string;
  money?: boolean;
};

export type ReportColumn = {
  key: string;
  label: LocalizedString;
  money?: boolean;
  /** A date or timestamp column shown as an Ethiopian date. */
  eth_date?: boolean;
};

export type ReportDef = {
  key: string;
  title: LocalizedString;
  /** A view with a date column (`dateCol`), or an RPC taking `p_from` and `p_to` (UTC timestamps). */
  source: { view: string } | { rpc: string };
  /** Default 'created_at'. */
  dateCol?: string;
  tiles: ReportTile[];
  columns: ReportColumn[];
};

/** Most rows a report fetches or exports; more asks the owner to narrow the period. */
export const ROW_CAP = 10_000;

export type ReportStrings = {
  exportCsv: string;
  print: string;
  loading: string;
  empty: (period: string) => string;
  stale: string;
  failed: string;
  retry: string;
  tooMany: string;
  rows: (n: number) => string;
};

const STRINGS: Record<EthLang, ReportStrings> = {
  en: {
    exportCsv: "Export CSV",
    print: "Print",
    loading: "Loading…",
    empty: (p) => `Nothing was recorded in ${p}.`,
    stale: "Saved copy, may be out of date",
    failed: "Could not load this report.",
    retry: "Try again",
    tooMany: "Over 10,000 rows. Pick a shorter period to see and export them all.",
    rows: (n) => (n === 1 ? "1 row" : `${n} rows`),
  },
  am: {
    exportCsv: "CSV አውርድ",
    print: "አትም",
    loading: "በመጫን ላይ…",
    empty: (p) => `በ${p} ምንም አልተመዘገበም።`,
    stale: "የተቀመጠ ቅጂ፣ ያልታደሰ ሊሆን ይችላል",
    failed: "ሪፖርቱን መጫን አልተቻለም።",
    retry: "እንደገና ሞክር",
    tooMany: "ከ10,000 በላይ መስመሮች። ሁሉንም ለማየትና ለማውረድ አጭር ጊዜ ይምረጡ።",
    rows: (n) => `${n} መስመር`,
  },
  om: {
    exportCsv: "CSV buusi",
    print: "Maxxansi",
    loading: "Fe'aa jira…",
    empty: (p) => `${p} keessatti homtuu hin galmoofne.`,
    stale: "Garagalcha kuufame, haaraa dhiisuu danda'a",
    failed: "Gabaasni kun fe'amuu hin dandeenye.",
    retry: "Irra deebi'i",
    tooMany: "Sararoota 10,000 ol. Hunda arguuf fi buusuuf yeroo gabaabaa filadhu.",
    rows: (n) => `Sarara ${n}`,
  },
};

export function reportStrings(lang: string): ReportStrings {
  return STRINGS[lang as EthLang] ?? STRINGS.en;
}

export const pickLang = (s: LocalizedString, lang: string) => s[lang as EthLang] ?? s.en;

// ---- Tiles and cells ---------------------------------------------------------------------

/** PostgREST sends numeric columns as strings; anything not a finite number counts as 0. */
export function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** A tile's value over the fetched rows. Sums are rounded to the cent to stop float drift. */
export function tileValue(tile: ReportTile, rows: ReportRow[]): number {
  if (tile.agg === "count") return rows.length;
  const col = tile.col ?? tile.key;
  const sum = rows.reduce((acc, r) => acc + toNumber(r[col]), 0);
  const value = tile.agg === "sum" ? sum : rows.length ? sum / rows.length : 0;
  return Math.round(value * 100) / 100;
}

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** "ብር 1,250.00" in Amharic, "1,250.00 ETB" otherwise (same as receipts). */
export function formatMoney(n: number, lang: string): string {
  return lang === "am" ? `ብር ${money.format(n)}` : `${money.format(n)} ETB`;
}

export function formatTile(tile: ReportTile, value: number, lang: string): string {
  return tile.money ? formatMoney(value, lang) : plain.format(value);
}

/** The Addis Ababa day of a date or timestamp value, 'YYYY-MM-DD' ('' when it is not one). */
export function dayOf(v: unknown): string {
  if (typeof v !== "string" || v === "") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return "";
  return new Date(t.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** What a table cell shows. */
export function cellText(col: ReportColumn, row: ReportRow, lang: string): string {
  const v = row[col.key];
  if (v === null || v === undefined) return "";
  if (col.money) return formatMoney(toNumber(v), lang);
  if (col.eth_date) {
    const day = dayOf(v);
    return day ? formatEthDay(day, lang as EthLang, false) : "";
  }
  return typeof v === "number" ? plain.format(v) : String(v);
}

// ---- Fetching ----------------------------------------------------------------------------

type Result = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type Filter = { gte(c: string, v: string): Filter; lt(c: string, v: string): Filter; order(c: string): Filter; limit(n: number): Result };

/** The part of a Supabase client the kit uses. */
export type ReportClient = {
  from(view: string): { select(cols: string): Filter };
  rpc(fn: string, args: Record<string, unknown>): { limit(n: number): Result };
};

export type ReportResult = { rows: ReportRow[]; tooMany: boolean; stale: boolean; fetchedAt: number };
export type ReportFetcher = (def: ReportDef, period: Pick<Period, "from" | "to">) => Promise<ReportResult>;

/**
 * Fetches a report's rows for a period: one cap+1 query so "too many" is known without a count.
 * Results are cached per {def, period} for `freshMs` (5 s); after that a failed fetch (offline)
 * returns the cached rows marked `stale` instead of an error.
 */
export function createReportFetcher(client: ReportClient, { freshMs = 5000, now = () => Date.now() } = {}): ReportFetcher {
  const cache = new Map<string, ReportResult>();
  return async (def, period) => {
    const key = `${def.key}|${period.from}|${period.to}`;
    const hit = cache.get(key);
    if (hit && now() - hit.fetchedAt < freshMs) return hit;
    try {
      const { data, error } =
        "view" in def.source
          ? await client
              .from(def.source.view)
              .select("*")
              .gte(def.dateCol ?? "created_at", period.from)
              .lt(def.dateCol ?? "created_at", period.to)
              .order(def.dateCol ?? "created_at")
              .limit(ROW_CAP + 1)
          : await client.rpc(def.source.rpc, { p_from: period.from, p_to: period.to }).limit(ROW_CAP + 1);
      if (error) throw new Error(error.message);
      const all = Array.isArray(data) ? (data as ReportRow[]) : [];
      const result = { rows: all.slice(0, ROW_CAP), tooMany: all.length > ROW_CAP, stale: false, fetchedAt: now() };
      cache.set(key, result);
      return result;
    } catch (e) {
      if (hit) return { ...hit, stale: true };
      throw e;
    }
  };
}
