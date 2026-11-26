import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveChoice } from "@/lib/galmee/period-picker";
import {
  cellText,
  createReportFetcher,
  dayOf,
  formatMoney,
  reportStrings,
  ROW_CAP,
  tileValue,
  toNumber,
  type ReportClient,
  type ReportDef,
  type ReportRow,
} from "@/lib/galmee/report";
import { ReportBody } from "./report-screen";

const def: ReportDef = {
  key: "sales",
  title: { en: "Sales", am: "ሽያጭ", om: "Gurgurtaa" },
  source: { view: "ph_sales_report" },
  tiles: [
    { key: "total", label: { en: "Sales", am: "ሽያጭ", om: "Gurgurtaa" }, agg: "sum", col: "total", money: true },
    { key: "count", label: { en: "Receipts", am: "ደረሰኞች", om: "Nagahee" }, agg: "count" },
    { key: "avg", label: { en: "Average", am: "አማካይ", om: "Giddugaleessa" }, agg: "avg", col: "total", money: true },
  ],
  columns: [
    { key: "created_at", label: { en: "Date", am: "ቀን", om: "Guyyaa" }, eth_date: true },
    { key: "total", label: { en: "Total", am: "ድምር", om: "Waliigala" }, money: true },
  ],
};

const rows: ReportRow[] = [
  { id: 1, created_at: "2026-11-24T21:30:00Z", total: "120.10" },
  { id: 2, created_at: "2026-11-25T06:00:00Z", total: "79.95" },
  { id: 3, created_at: "2026-11-25T08:00:00Z", total: 0.05 },
];
const period = resolveChoice({ kind: "today" }, "2026-11-25", "en");

describe("tiles", () => {
  it("sum, count and average match the rows", () => {
    expect(tileValue(def.tiles[0], rows)).toBe(200.1);
    expect(tileValue(def.tiles[1], rows)).toBe(3);
    expect(tileValue(def.tiles[2], rows)).toBe(66.7);
    expect(tileValue(def.tiles[2], [])).toBe(0);
  });
  it("reads numeric strings and ignores junk", () => {
    expect(toNumber("12.5")).toBe(12.5);
    expect([toNumber(""), toNumber(null), toNumber("abc"), toNumber(Infinity)]).toEqual([0, 0, 0, 0]);
  });
  it("formats money like receipts", () => {
    expect(formatMoney(1250, "am")).toBe("ብር 1,250.00");
    expect(formatMoney(1250, "en")).toBe("1,250.00 ETB");
  });
  it("shows timestamps as the Ethiopian day in Addis Ababa", () => {
    expect(dayOf("2026-11-24T21:30:00Z")).toBe("2026-11-25");
    expect(cellText(def.columns[0], rows[0], "en")).toBe("Hidar 16, 2019");
    expect(cellText(def.columns[1], rows[1], "am")).toBe("ብር 79.95");
    expect(cellText(def.columns[1], { total: null }, "en")).toBe("");
  });
});

describe("<ReportBody>", () => {
  const html = (load: Parameters<typeof ReportBody>[0]["load"], lang = "en") =>
    renderToStaticMarkup(createElement(ReportBody, { def, lang, period: resolveChoice({ kind: "today" }, "2026-11-25", lang), load }));

  it("renders tiles from the fixture rows and the rows themselves", () => {
    const out = html({ state: "ready", rows, tooMany: false, stale: false, fetchedAt: 0 });
    expect(out).toMatch(/data-tile="total">200.10 ETB</);
    expect(out).toMatch(/data-tile="count">3</);
    expect(out).toContain("3 rows");
    expect(out).toContain("120.10 ETB");
    expect(out).not.toContain("data-stale");
  });
  it("an empty period shows the ruled empty page with the period, never a bare table", () => {
    const out = html({ state: "ready", rows: [], tooMany: false, stale: false, fetchedAt: 0 }, "am");
    expect(out).toContain(reportStrings("am").empty(resolveChoice({ kind: "today" }, "2026-11-25", "am").label));
    expect(out).not.toContain("<table");
    expect(out).toMatch(/data-tile="total">ብር 0.00</);
  });
  it("marks a saved copy and a capped result", () => {
    const out = html({ state: "ready", rows, tooMany: true, stale: true, fetchedAt: 0 });
    expect(out).toContain("data-stale");
    expect(out).toContain(reportStrings("en").tooMany);
  });
  it("loading and failure states", () => {
    expect(html({ state: "loading" }, "om")).toContain("Fe&#x27;aa jira…");
    expect(html({ state: "error" })).toContain(reportStrings("en").failed);
  });
});

describe("createReportFetcher", () => {
  function fakeClient(script: (() => { data: unknown; error: { message: string } | null })[]) {
    const calls: string[] = [];
    const result = () => Promise.resolve(script.shift()!());
    const chain = (log: string[]) => {
      const f = {
        gte: (c: string, v: string) => (log.push(`gte ${c} ${v}`), f),
        lt: (c: string, v: string) => (log.push(`lt ${c} ${v}`), f),
        order: (c: string) => (log.push(`order ${c}`), f),
        limit: (n: number) => (log.push(`limit ${n}`), result()),
      };
      return f;
    };
    const client: ReportClient = {
      from: (v) => ({ select: (c) => (calls.push(`from ${v} ${c}`), chain(calls)) }),
      rpc: (fn, args) => (calls.push(`rpc ${fn} ${JSON.stringify(args)}`), { limit: (n: number) => (calls.push(`limit ${n}`), result()) }),
    };
    return { client, calls };
  }

  it("queries the view for the half-open period, capped at cap+1", async () => {
    const { client, calls } = fakeClient([() => ({ data: rows, error: null })]);
    const r = await createReportFetcher(client)(def, period);
    expect(r).toMatchObject({ rows, tooMany: false, stale: false });
    expect(calls).toEqual([
      "from ph_sales_report *",
      `gte created_at ${period.from}`,
      `lt created_at ${period.to}`,
      "order created_at",
      `limit ${ROW_CAP + 1}`,
    ]);
  });
  it("calls an RPC with p_from and p_to", async () => {
    const { client, calls } = fakeClient([() => ({ data: [], error: null })]);
    await createReportFetcher(client)({ ...def, source: { rpc: "ws_ageing_report" } }, period);
    expect(calls[0]).toBe(`rpc ws_ageing_report {"p_from":"${period.from}","p_to":"${period.to}"}`);
  });
  it("flags more than the cap and keeps only the cap", async () => {
    const many = Array.from({ length: ROW_CAP + 1 }, (_, i) => ({ id: i }));
    const { client } = fakeClient([() => ({ data: many, error: null })]);
    const r = await createReportFetcher(client)(def, period);
    expect(r.tooMany).toBe(true);
    expect(r.rows).toHaveLength(ROW_CAP);
  });
  it("serves a fresh cache, then falls back to a stale copy when offline", async () => {
    let t = 0;
    const { client } = fakeClient([
      () => ({ data: rows, error: null }),
      () => {
        throw new TypeError("Failed to fetch");
      },
    ]);
    const fetch = createReportFetcher(client, { now: () => t });
    await fetch(def, period);
    t = 4000;
    expect((await fetch(def, period)).stale).toBe(false); // cached, no call
    t = 6000;
    const r = await fetch(def, period);
    expect(r).toMatchObject({ rows, stale: true });
  });
  it("throws when there is nothing cached", async () => {
    const { client } = fakeClient([() => ({ data: null, error: { message: "permission denied" } })]);
    await expect(createReportFetcher(client)(def, period)).rejects.toThrow("permission denied");
  });
});

describe("80 mm summary", () => {
  it("prints the tiles, a count as a number, and no payment rows", async () => {
    const { reportSummaryReceipt } = await import("@/lib/galmee/report-summary");
    const { receiptModel, layoutText } = await import("@/lib/galmee/receipt");
    const p = resolveChoice({ kind: "week" }, "2026-11-25", "am");
    const data = reportSummaryReceipt(def, p, rows, { name: "Galmee Pharmacy Demo" }, "am");
    const m = receiptModel(data);
    expect(m.title).toBe("የሪፖርት ማጠቃለያ");
    expect(m.lines.map((l) => [l.name, l.total])).toEqual([
      ["ሽያጭ", "200.10"],
      ["ደረሰኞች", "3"],
      ["አማካይ", "66.70"],
    ]);
    expect(m.totals).toEqual([]);
    expect(m.meta[0]).toEqual({ label: "ሽያጭ · ኅዳር 14 – 16, 2019 ዓ.ም.", value: "(2026-11-23 – 2026-11-25)" });
    const text = layoutText(data, 80).join("\n");
    expect(text).not.toContain("የተከፈለ");
    expect(text).toContain("200.10");
  });
});
