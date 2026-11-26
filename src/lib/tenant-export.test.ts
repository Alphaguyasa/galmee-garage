import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { tenantExportSheets, type TenantExportInput } from "./tenant-export";
import { buildXlsx } from "./xlsx";

const table = (rows: Record<string, unknown>[], truncated = false) => ({ rows, truncated });

/** Looks keys up in the English messages, with {cap}-style values, like next-intl does. */
function t(key: string, values?: Record<string, string | number>): string {
  const found = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en.export);
  if (typeof found !== "string") throw new Error(`missing export.${key}`);
  return found.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? ""));
}

const labels = {
  status: (code: string) => (en.status as Record<string, string>)[code] ?? code,
  method: (code: string) => (en.job.methods as Record<string, string>)[code] ?? code,
};

const data: TenantExportInput = {
  tenantName: "Bekele Garage",
  vehicles: table([
    { id: "v1", plate: "AA 3-B12345", customer_id: "c1", make: "Toyota", model: "Vitz", year: 2012, color: null, notes: null, created_at: "2026-11-01T08:00:00Z" },
  ]),
  mechanics: table([{ id: "m1", name: "Dawit K.", phone: null, active: false, created_at: "2026-11-01T07:00:00Z" }]),
  jobs: table([
    {
      id: "j1", job_no: 17, vehicle_id: "v1", customer_id: "c1", mechanic_id: "m1", complaint: "Brakes squeal", work_done: null, odometer_km: 152300,
      status: "ready", parts_total: "850.00", labour_total: 400, total: 1250, paid_total: 500, balance: 750, debt_posted: 0, created_by: "u1",
      opened_at: "2026-11-03T08:00:00Z", ready_at: "2026-11-04T15:00:00Z", delivered_at: null,
    },
  ]),
  jobParts: table([
    { id: "p1", job_id: "j1", item_id: "i1", qty: 2, unit_price: 425, line_total: 850, created_at: "2026-11-03T09:00:00Z", reversed_at: null },
  ]),
  jobLabour: table([
    { id: "l1", job_id: "j1", mechanic_id: null, description: "Brake pads fitted", amount: 400, created_at: "2026-11-03T10:00:00Z", reversed_at: "2026-11-03T10:05:00Z" },
  ]),
  jobPayments: table([
    { id: "jp1", job_id: "j1", amount: 500, method: "telebirr", created_by: "u1", created_at: "2026-11-03T11:00:00Z", client_ref: "r1" },
  ]),
  customers: table([
    { id: "c1", name: "Kebede T.", phone: "0911000000", credit_limit: 2000, notes: "=cmd", created_at: "2026-11-01T09:00:00Z" },
    { id: "c2", name: "Almaz G.", phone: null, credit_limit: 0, notes: null, created_at: "2026-11-01T09:05:00Z" },
  ]),
  balances: table([{ customer_id: "c1", balance: 120.456, oldest_debt_at: "2026-11-03T10:00:00Z" }]),
  parts: table([
    { id: "i1", sku: "BP-01", name_en: "Brake pad set", name_am: "የፍሬን ሸራ", name_om: null, unit: "set", category: null, price: "425", cost: 300, reorder_level: 4, active: true, created_at: "2026-11-01T08:00:00Z" },
  ]),
  batches: table([{ id: "b1", item_id: "i1", batch_no: null, qty: 6, cost: 300, expiry_date: null, received_at: "2026-11-02T08:00:00Z" }], true),
  payments: table([
    { id: "pay1", created_at: "2026-11-03T11:00:00Z", customer_id: "c1", amount: 500, method: "telebirr", reference: null, ref_table: "gr_job_cards", ref_id: "j1" },
  ]),
  ledger: table([]),
  staff: table([{ user_id: "u1", full_name: "Hana M." }]),
};

const sheets = tenantExportSheets(data, t, labels, "am", "2026-11-26T12:00:00Z", 50000);
const sheet = (name: string) => sheets.find((s) => s.name === name)!.rows;

describe("tenantExportSheets", () => {
  it("starts with an About sheet, then one sheet per kind of record", () => {
    expect(sheets.map((s) => s.name)).toEqual([
      "About", "Job cards", "Job parts", "Job labour", "Job payments", "Cars", "Customers", "Mechanics", "Parts", "Stock batches", "Payments", "Credit ledger",
    ]);
    const about = sheet("About");
    expect(about[1]).toEqual(["Garage", "Bekele Garage"]);
    expect(about).toContainEqual(["Customers", 2, null]);
    expect(about).toContainEqual(["Credit ledger", 0, null]);
    expect(about).toContainEqual(["Stock batches", 1, "Only the first 50000 rows; ask for a full copy"]);
  });

  it("every row has as many cells as its header", () => {
    for (const s of sheets.slice(1)) for (const row of s.rows) expect(row).toHaveLength(s.rows[0].length);
  });

  it("shows each job with its plate, customer, mechanic and status as on screen", () => {
    expect(sheet("Job cards")[1]).toEqual([
      17, "j1", "2026-11-03T08:00:00Z", "AA 3-B12345", "v1", "Kebede T.", "c1", "Dawit K.", "Brakes squeal", null, 152300,
      "Ready", 850, 400, 1250, 500, 750, 0, "Hana M.", "2026-11-04T15:00:00Z", null,
    ]);
  });

  it("links lines to their job number and names parts in the screen language", () => {
    expect(sheet("Job parts")[1]).toEqual([17, "j1", "የፍሬን ሸራ", "i1", 2, 425, 850, "2026-11-03T09:00:00Z", null]);
    expect(sheet("Job labour")[1]).toEqual([17, "j1", null, "Brake pads fitted", 400, "2026-11-03T10:00:00Z", "2026-11-03T10:05:00Z"]);
    expect(sheet("Job payments")[1]).toEqual([17, "j1", "2026-11-03T11:00:00Z", 500, "Telebirr", "Hana M.", "r1"]);
    expect(sheet("Stock batches")[1].slice(1, 3)).toEqual(["የፍሬን ሸራ", "i1"]);
  });

  it("gives each customer their balance, 0 when they owe nothing, and keeps notes as text", () => {
    const customers = sheet("Customers");
    expect(customers[1][4]).toBe(120.46);
    expect(customers[2][4]).toBe(0);
    expect(customers[1][6]).toBe("=cmd");
    expect(sheet("Mechanics")[1][3]).toBe("No");
    expect(sheet("Parts")[1][7]).toBe(425);
  });

  it("builds a workbook from the sheets (a zip that starts with PK)", () => {
    const file = buildXlsx(sheets);
    expect(Array.from(file.slice(0, 2))).toEqual([0x50, 0x4b]);
  });
});
