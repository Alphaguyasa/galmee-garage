import { describe, expect, it } from "vitest";
import { createReportFetcher, tileValue } from "@/lib/galmee/report";
import { reportCsv } from "@/lib/galmee/report-csv";
import { closedJobRow, GARAGE_REPORTS, jobPaymentRow, runnerClient } from "./garage-reports";

const closed = GARAGE_REPORTS.find((d) => d.key === "closed")!;
const payments = GARAGE_REPORTS.find((d) => d.key === "payments")!;

// Three jobs handed over in the period, as the API returns them (embeds as objects or arrays).
const fixture = [
  { id: "j1", job_no: 11, delivered_at: "2026-11-24T09:00:00Z", parts_total: "850", labour_total: 400, total: 1250, balance: 0, gr_vehicles: { plate: "AA 3-B12345" }, customers: { name: "Kebede T." }, gr_mechanics: { name: "Dawit K." } },
  { id: "j2", job_no: 12, delivered_at: "2026-11-24T15:30:00Z", parts_total: 0, labour_total: 300, total: 300, balance: 300, gr_vehicles: [{ plate: "OR 2-A54321" }], customers: null, gr_mechanics: null },
  { id: "j3", job_no: 13, delivered_at: "2026-11-25T08:10:00Z", parts_total: 1200.5, labour_total: 500, total: 1700.5, balance: 200, gr_vehicles: { plate: "AA 2-C11111" }, customers: { name: "Almaz G." }, gr_mechanics: { name: "Dawit K." } },
];

describe("garage report defs", () => {
  it("jobs closed: count and money tiles match the fixture", () => {
    const rows = fixture.map(closedJobRow);
    const tile = (key: string) => tileValue(closed.tiles.find((t) => t.key === key)!, rows);
    expect(tile("count")).toBe(3);
    expect(tile("total")).toBeCloseTo(3250.5);
    expect(tile("labour")).toBe(1200);
    expect(tile("balance")).toBe(500);
    expect(rows[1]).toMatchObject({ plate: "OR 2-A54321", customer: "", mechanic: "", created_at: "2026-11-24T15:30:00Z" });
  });

  it("jobs closed are filtered by hand-over date, through the kit's fetcher", async () => {
    const seen: { from?: string; to?: string }[] = [];
    const fetcher = createReportFetcher(
      runnerClient({
        "gr:jobs_closed": async (range) => {
          seen.push(range ?? {});
          return { data: fixture.map(closedJobRow), error: null };
        },
      }),
    );
    const result = await fetcher(closed, { from: "2026-11-23T21:00:00Z", to: "2026-11-25T21:00:00Z" });
    expect(closed.dateCol).toBe("delivered_at");
    expect(seen).toEqual([{ from: "2026-11-23T21:00:00Z", to: "2026-11-25T21:00:00Z" }]);
    expect(result.rows).toHaveLength(3);
  });

  it("an unknown source is an error, not an empty report", async () => {
    const fetcher = createReportFetcher(runnerClient({}));
    await expect(fetcher(payments, { from: "2026-11-01T00:00:00Z", to: "2026-11-02T00:00:00Z" })).rejects.toThrow();
  });

  it("job payments carry the job number, plate and the method as shown on screen", () => {
    const row = jobPaymentRow(
      { id: "p1", created_at: "2026-11-24T10:00:00Z", amount: "500", method: "telebirr", gr_job_cards: { job_no: 11, gr_vehicles: { plate: "AA 3-B12345" } } },
      (m) => (m === "telebirr" ? "Telebirr" : m),
    );
    expect(row).toEqual({ id: "p1", created_at: "2026-11-24T10:00:00Z", job_no: 11, plate: "AA 3-B12345", amount: 500, method: "Telebirr" });
  });

  it("CSV of jobs closed has every column, with the Amharic header intact", () => {
    const csv = reportCsv(fixture.map(closedJobRow), closed.columns, "am");
    const lines = csv.text.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toContain("ሰሌዳ");
    expect(csv.rows).toBe(3);
  });
});
