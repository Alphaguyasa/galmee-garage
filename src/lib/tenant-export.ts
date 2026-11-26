import type { Locale } from "@/i18n/config";
import type { XlsxCell, XlsxSheet } from "@/lib/xlsx";

type Row = Record<string, unknown>;
type Table = { rows: Row[]; truncated: boolean };

export type TenantExportInput = {
  tenantName: string;
  vehicles: Table;
  mechanics: Table;
  jobs: Table;
  jobParts: Table;
  jobLabour: Table;
  jobPayments: Table;
  customers: Table;
  balances: Table;
  parts: Table;
  batches: Table;
  payments: Table;
  ledger: Table;
  staff: Table;
};

/** Translator for keys under `export` (sheet.*, col.*, about.*, yes, no). */
export type ExportT = (key: string, values?: Record<string, string | number>) => string;

/** Labels the app already has elsewhere: job status and payment method, as shown on screen. */
export type ExportLabels = { status: (code: string) => string; method: (code: string) => string };

const text = (v: unknown): XlsxCell => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown): XlsxCell => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const money = (v: unknown): XlsxCell => {
  const n = num(v);
  return typeof n === "number" ? Math.round(n * 100) / 100 : null;
};

function index(rows: Row[], key: string): Map<string, Row> {
  return new Map(rows.map((r) => [String(r[key]), r]));
}

function partName(item: Row | undefined, locale: Locale): XlsxCell {
  if (!item) return null;
  if (locale === "am" && item.name_am) return String(item.name_am);
  if (locale === "om" && item.name_om) return String(item.name_om);
  return text(item.name_en);
}

/**
 * The owner's full export as workbook sheets: one sheet per kind of record, with plates,
 * customer, mechanic and part names beside their ids so the file reads without the app,
 * and an "About" sheet first that says when it was made and whether any sheet hit the row cap.
 */
export function tenantExportSheets(
  data: TenantExportInput,
  t: ExportT,
  labels: ExportLabels,
  locale: Locale,
  exportedAt: string,
  rowCap: number,
): XlsxSheet[] {
  const yesNo = (v: unknown): XlsxCell => (v === null || v === undefined ? null : v ? t("yes") : t("no"));
  const vehicles = index(data.vehicles.rows, "id");
  const mechanics = index(data.mechanics.rows, "id");
  const jobs = index(data.jobs.rows, "id");
  const customers = index(data.customers.rows, "id");
  const balances = index(data.balances.rows, "customer_id");
  const parts = index(data.parts.rows, "id");
  const staff = index(data.staff.rows, "user_id");

  const lookup = (map: Map<string, Row>, id: unknown, field: string): XlsxCell =>
    id === null || id === undefined ? null : text(map.get(String(id))?.[field]);
  const part = (id: unknown): XlsxCell => (id === null || id === undefined ? null : partName(parts.get(String(id)), locale));
  const status = (v: unknown): XlsxCell => (v ? labels.status(String(v)) : null);
  const method = (v: unknown): XlsxCell => (v ? labels.method(String(v)) : null);
  const head = (...keys: string[]) => keys.map((k) => t(`col.${k}`));

  const sheets: { key: string; table: Table; rows: XlsxCell[][] }[] = [
    {
      key: "jobs",
      table: data.jobs,
      rows: [
        head(
          "jobNo", "id", "opened", "plate", "vehicleId", "customer", "customerId", "mechanic", "complaint", "workDone", "odometer",
          "status", "parts", "labour", "total", "paid", "balance", "debtPosted", "openedBy", "ready", "delivered",
        ),
        ...data.jobs.rows.map((r) => [
          num(r.job_no), text(r.id), text(r.opened_at), lookup(vehicles, r.vehicle_id, "plate"), text(r.vehicle_id),
          lookup(customers, r.customer_id, "name"), text(r.customer_id), lookup(mechanics, r.mechanic_id, "name"),
          text(r.complaint), text(r.work_done), num(r.odometer_km), status(r.status), money(r.parts_total), money(r.labour_total),
          money(r.total), money(r.paid_total), money(r.balance), money(r.debt_posted), lookup(staff, r.created_by, "full_name"),
          text(r.ready_at), text(r.delivered_at),
        ]),
      ],
    },
    {
      key: "jobParts",
      table: data.jobParts,
      rows: [
        head("jobNo", "jobId", "part", "partId", "qty", "price", "lineTotal", "added", "removed"),
        ...data.jobParts.rows.map((r) => [
          num(jobs.get(String(r.job_id))?.job_no), text(r.job_id), part(r.item_id), text(r.item_id), num(r.qty), money(r.unit_price),
          money(r.line_total), text(r.created_at), text(r.reversed_at),
        ]),
      ],
    },
    {
      key: "jobLabour",
      table: data.jobLabour,
      rows: [
        head("jobNo", "jobId", "mechanic", "description", "amount", "added", "removed"),
        ...data.jobLabour.rows.map((r) => [
          num(jobs.get(String(r.job_id))?.job_no), text(r.job_id), lookup(mechanics, r.mechanic_id, "name"), text(r.description),
          money(r.amount), text(r.created_at), text(r.reversed_at),
        ]),
      ],
    },
    {
      key: "jobPayments",
      table: data.jobPayments,
      rows: [
        head("jobNo", "jobId", "created", "amount", "method", "takenBy", "clientRef"),
        ...data.jobPayments.rows.map((r) => [
          num(jobs.get(String(r.job_id))?.job_no), text(r.job_id), text(r.created_at), money(r.amount), method(r.method),
          lookup(staff, r.created_by, "full_name"), text(r.client_ref),
        ]),
      ],
    },
    {
      key: "vehicles",
      table: data.vehicles,
      rows: [
        head("plate", "id", "customer", "customerId", "make", "model", "year", "color", "notes", "created"),
        ...data.vehicles.rows.map((r) => [
          text(r.plate), text(r.id), lookup(customers, r.customer_id, "name"), text(r.customer_id), text(r.make), text(r.model),
          num(r.year), text(r.color), text(r.notes), text(r.created_at),
        ]),
      ],
    },
    {
      key: "customers",
      table: data.customers,
      rows: [
        head("id", "name", "phone", "creditLimit", "owes", "oldestDebt", "notes", "created"),
        ...data.customers.rows.map((r) => {
          const b = balances.get(String(r.id));
          return [
            text(r.id), text(r.name), text(r.phone), money(r.credit_limit), money(b?.balance ?? 0), text(b?.oldest_debt_at), text(r.notes),
            text(r.created_at),
          ];
        }),
      ],
    },
    {
      key: "mechanics",
      table: data.mechanics,
      rows: [
        head("id", "name", "phone", "active", "created"),
        ...data.mechanics.rows.map((r) => [text(r.id), text(r.name), text(r.phone), yesNo(r.active), text(r.created_at)]),
      ],
    },
    {
      key: "parts",
      table: data.parts,
      rows: [
        head("id", "sku", "nameEn", "nameAm", "nameOm", "unit", "category", "price", "cost", "reorderLevel", "active", "created"),
        ...data.parts.rows.map((r) => [
          text(r.id), text(r.sku), text(r.name_en), text(r.name_am), text(r.name_om), text(r.unit), text(r.category), money(r.price),
          money(r.cost), num(r.reorder_level), yesNo(r.active), text(r.created_at),
        ]),
      ],
    },
    {
      key: "batches",
      table: data.batches,
      rows: [
        head("id", "part", "partId", "batchNo", "qty", "cost", "expiry", "received"),
        ...data.batches.rows.map((r) => [
          text(r.id), part(r.item_id), text(r.item_id), text(r.batch_no), num(r.qty), money(r.cost), text(r.expiry_date), text(r.received_at),
        ]),
      ],
    },
    {
      key: "payments",
      table: data.payments,
      rows: [
        head("id", "created", "customer", "customerId", "amount", "method", "reference", "refTable", "refId"),
        ...data.payments.rows.map((r) => [
          text(r.id), text(r.created_at), lookup(customers, r.customer_id, "name"), text(r.customer_id), money(r.amount), method(r.method),
          text(r.reference), text(r.ref_table), text(r.ref_id),
        ]),
      ],
    },
    {
      key: "ledger",
      table: data.ledger,
      rows: [
        head("id", "created", "customer", "customerId", "type", "amount", "due", "notes"),
        ...data.ledger.rows.map((r) => [
          text(r.id), text(r.created_at), lookup(customers, r.customer_id, "name"), text(r.customer_id), text(r.type), money(r.amount),
          text(r.due_date), text(r.note),
        ]),
      ],
    },
  ];

  const about: XlsxCell[][] = [
    [t("about.field"), t("about.value")],
    [t("about.business"), data.tenantName],
    [t("about.exportedAt"), exportedAt],
    [t("about.dates"), t("about.datesNote")],
    [t("about.removed"), t("about.removedNote")],
    [],
    [t("about.sheet"), t("about.rows")],
    ...sheets.map((s) => [t(`sheet.${s.key}`), s.rows.length - 1, s.table.truncated ? t("about.truncated", { cap: rowCap }) : null]),
  ];

  return [{ name: t("sheet.about"), rows: about }, ...sheets.map((s) => ({ name: t(`sheet.${s.key}`), rows: s.rows }))];
}
