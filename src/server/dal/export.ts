import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

/** Rows read per request (the API returns at most 1000) and the most read from one table. */
const PAGE = 1000;
export const EXPORT_ROW_CAP = 50_000;

type Table =
  | "gr_vehicles"
  | "gr_mechanics"
  | "gr_job_cards"
  | "gr_job_parts"
  | "gr_job_labour"
  | "gr_job_payments"
  | "customers"
  | "customer_balances"
  | "items"
  | "stock_batches"
  | "payments"
  | "credit_ledger"
  | "profiles";

type Query = {
  order(column: string): Query;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

export type ExportTable = { rows: Record<string, unknown>[]; truncated: boolean };

export type TenantExportDTO = {
  tenantName: string;
  vehicles: ExportTable;
  mechanics: ExportTable;
  jobs: ExportTable;
  jobParts: ExportTable;
  jobLabour: ExportTable;
  jobPayments: ExportTable;
  customers: ExportTable;
  balances: ExportTable;
  parts: ExportTable;
  batches: ExportTable;
  payments: ExportTable;
  ledger: ExportTable;
  staff: ExportTable;
};

export type ExportResult = { ok: true; data: TenantExportDTO } | { ok: false; code: "forbidden" | "generic" };

/**
 * Everything this garage has in Galmee, for the owner to keep or take elsewhere.
 * Row-level security limits every read to the caller's own business; the owner check is
 * here because the file holds every customer's phone and balance. Status-link tokens are
 * left out on purpose: they open a job's status page without a login.
 */
export async function exportTenantData(): Promise<ExportResult> {
  const session = await getSession();
  if (session.profile.role !== "owner") return { ok: false, code: "forbidden" };
  // Read-only, column lists fixed in this file; a loose builder type covers tables and views alike.
  const db = (await createClient()) as unknown as { from(table: Table): { select(columns: string): Query } };

  async function readAll(table: Table, columns: string, order: string): Promise<ExportTable> {
    // A unique last sort key keeps pages from repeating or skipping rows.
    const keys = order === "id" || !columns.split(", ").includes("id") ? [order] : [order, "id"];
    const sorted = (q: Query) => keys.reduce((acc, k) => acc.order(k), q);
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; from < EXPORT_ROW_CAP; from += PAGE) {
      const to = Math.min(from + PAGE, EXPORT_ROW_CAP) - 1;
      const { data, error } = await sorted(db.from(table).select(columns)).range(from, to);
      if (error) throw new Error(`export_${table}`);
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < to - from + 1) return { rows, truncated: false };
    }
    // Exactly at the cap: one more read tells whether anything was left out.
    const { data } = await sorted(db.from(table).select(order)).range(EXPORT_ROW_CAP, EXPORT_ROW_CAP);
    return { rows, truncated: (data ?? []).length > 0 };
  }

  try {
    const [vehicles, mechanics, jobs, jobParts, jobLabour, jobPayments, customers, balances, parts, batches, payments, ledger, staff] =
      await Promise.all([
        readAll("gr_vehicles", "id, plate, customer_id, make, model, year, color, notes, created_at", "created_at"),
        readAll("gr_mechanics", "id, name, phone, active, created_at", "created_at"),
        readAll(
          "gr_job_cards",
          "id, job_no, vehicle_id, customer_id, mechanic_id, complaint, work_done, odometer_km, status, parts_total, labour_total, total, paid_total, balance, debt_posted, created_by, opened_at, ready_at, delivered_at",
          "opened_at",
        ),
        readAll("gr_job_parts", "id, job_id, item_id, qty, unit_price, line_total, created_at, reversed_at", "created_at"),
        readAll("gr_job_labour", "id, job_id, mechanic_id, description, amount, created_at, reversed_at", "created_at"),
        readAll("gr_job_payments", "id, job_id, amount, method, created_by, created_at, client_ref", "created_at"),
        readAll("customers", "id, name, phone, credit_limit, notes, created_at", "created_at"),
        readAll("customer_balances", "customer_id, balance, oldest_debt_at", "customer_id"),
        readAll("items", "id, sku, name_en, name_am, name_om, unit, category, price, cost, reorder_level, active, created_at", "created_at"),
        readAll("stock_batches", "id, item_id, batch_no, qty, cost, expiry_date, received_at", "received_at"),
        readAll("payments", "id, created_at, customer_id, amount, method, reference, ref_table, ref_id", "created_at"),
        readAll("credit_ledger", "id, created_at, customer_id, type, amount, due_date, note", "created_at"),
        readAll("profiles", "user_id, full_name", "user_id"),
      ]);
    return {
      ok: true,
      data: { tenantName: session.tenant.name, vehicles, mechanics, jobs, jobParts, jobLabour, jobPayments, customers, balances, parts, batches, payments, ledger, staff },
    };
  } catch {
    return { ok: false, code: "generic" };
  }
}
