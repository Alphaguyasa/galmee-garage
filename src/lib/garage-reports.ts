/**
 * Garage's reports for the Galmee report screen: jobs closed (handed over) and money taken
 * on jobs. The kit fetches `from(view).select().gte().lt().order().limit()`; here each
 * "view" name is a small runner that does the real query (with plate, customer and mechanic
 * joined) and hands back flat rows. RLS does the tenant filtering, as everywhere else.
 */

import type { ReportClient, ReportDef, ReportRow } from "@/lib/galmee/report";

export type Range = { from: string; to: string };
type RunnerResult = { data: ReportRow[] | null; error: { message: string } | null };
/** Runs one report query. `range` is null when the kit did not filter by date. */
export type SourceRunner = (range: Range | null, limit: number) => PromiseLike<RunnerResult>;

/** A ReportClient over named runners, so the kit's fetcher (cache, stale copy, row cap) is reused as is. */
export function runnerClient(runners: Record<string, SourceRunner>): ReportClient {
  return {
    from(view: string) {
      const run = runners[view];
      const range: Partial<Range> = {};
      const filter = {
        gte(_c: string, v: string) {
          range.from = v;
          return filter;
        },
        lt(_c: string, v: string) {
          range.to = v;
          return filter;
        },
        order() {
          return filter;
        },
        limit(n: number): PromiseLike<RunnerResult> {
          if (!run) return Promise.resolve({ data: null, error: { message: `unknown_report_source:${view}` } });
          const r = range.from && range.to ? { from: range.from, to: range.to } : null;
          return run(r, n);
        },
      };
      return { select: () => filter };
    },
    rpc(fn: string) {
      return { limit: () => Promise.resolve({ data: null, error: { message: `unknown_report_source:${fn}` } }) };
    },
  };
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

type One<T> = T | T[] | null | undefined;
const first = <T,>(v: One<T>): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

/** A handed-over job: its date is the hand-over, with plate, customer, mechanic and the money. */
export function closedJobRow(r: {
  id: string;
  job_no: unknown;
  delivered_at: string;
  parts_total: unknown;
  labour_total: unknown;
  total: unknown;
  balance: unknown;
  gr_vehicles?: One<{ plate?: string | null }>;
  customers?: One<{ name?: string | null }>;
  gr_mechanics?: One<{ name?: string | null }>;
}): ReportRow {
  return {
    id: r.id,
    created_at: r.delivered_at,
    job_no: num(r.job_no),
    plate: first(r.gr_vehicles)?.plate ?? "",
    customer: first(r.customers)?.name ?? "",
    mechanic: first(r.gr_mechanics)?.name ?? "",
    labour: num(r.labour_total),
    parts: num(r.parts_total),
    total: num(r.total),
    balance: num(r.balance),
  };
}

/** A payment taken on a job, with the job number and plate. */
export function jobPaymentRow(
  r: {
    id: string;
    created_at: string;
    amount: unknown;
    method: string;
    gr_job_cards?: One<{ job_no?: unknown; gr_vehicles?: One<{ plate?: string | null }> }>;
  },
  methodLabel: (method: string) => string = (m) => m,
): ReportRow {
  const job = first(r.gr_job_cards);
  return {
    id: r.id,
    created_at: r.created_at,
    job_no: job ? num(job.job_no) : "",
    plate: first(job?.gr_vehicles)?.plate ?? "",
    amount: num(r.amount),
    method: methodLabel(r.method),
  };
}

const L = (en: string, am: string, om: string) => ({ en, am, om });
const JOB_NO = { key: "job_no", label: L("Job no.", "የሥራ ቁ.", "Lakk. hojii") } as const;
const PLATE = { key: "plate", label: L("Plate", "ሰሌዳ", "Taargaa") } as const;

export const SOURCES = { closed: "gr:jobs_closed", payments: "gr:job_payments" } as const;

export const GARAGE_REPORTS: ReportDef[] = [
  {
    key: "closed",
    title: L("Jobs closed", "የተዘጉ ሥራዎች", "Hojii xumurame"),
    source: { view: SOURCES.closed },
    dateCol: "delivered_at",
    tiles: [
      { key: "count", label: L("Cars handed over", "የተረከቡ መኪኖች", "Konkolaataa kenname"), agg: "count" },
      { key: "total", label: L("Work done", "የተሠራ ሥራ", "Hojii hojjetame"), agg: "sum", col: "total", money: true },
      { key: "labour", label: L("Labour", "ጉልበት", "Humna"), agg: "sum", col: "labour", money: true },
      { key: "balance", label: L("Still to pay", "ቀሪ ክፍያ", "Kan hafe"), agg: "sum", col: "balance", money: true },
    ],
    columns: [
      { key: "created_at", label: L("Handed over", "የተረከበበት", "Kan kenname"), eth_date: true },
      JOB_NO,
      PLATE,
      { key: "customer", label: L("Customer", "ደንበኛ", "Maamila") },
      { key: "mechanic", label: L("Mechanic", "መካኒክ", "Mekaanikii") },
      { key: "labour", label: L("Labour", "ጉልበት", "Humna"), money: true },
      { key: "parts", label: L("Parts", "ዕቃዎች", "Meeshaa"), money: true },
      { key: "total", label: L("Total", "ጠቅላላ", "Waliigala"), money: true },
      { key: "balance", label: L("Still to pay", "ቀሪ ክፍያ", "Kan hafe"), money: true },
    ],
  },
  {
    key: "payments",
    title: L("Money taken on jobs", "በሥራ የተሰበሰበ ገንዘብ", "Maallaqa hojii irraa"),
    source: { view: SOURCES.payments },
    tiles: [
      { key: "amount", label: L("Collected", "የተሰበሰበ", "Kan walitti qabame"), agg: "sum", col: "amount", money: true },
      { key: "count", label: L("Payments", "ክፍያዎች", "Kaffaltii"), agg: "count" },
      { key: "avg", label: L("Average", "አማካይ", "Giddugaleessa"), agg: "avg", col: "amount", money: true },
    ],
    columns: [
      { key: "created_at", label: L("Date", "ቀን", "Guyyaa"), eth_date: true },
      JOB_NO,
      PLATE,
      { key: "amount", label: L("Amount", "መጠን", "Hanga"), money: true },
      { key: "method", label: L("Method", "መንገድ", "Mala") },
    ],
  },
];
