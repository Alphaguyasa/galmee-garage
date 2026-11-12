import "server-only";
import { createClient } from "@/lib/supabase/server";
import { garageErrorKey } from "@/lib/garage-errors";
import { plateKey } from "@/lib/plate";
import type { JobStatus } from "@/server/validation";
import type { Enums } from "@/lib/database.types";
import { getSession } from "@/server/dal/session";

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

type Names = { name_en: string; name_am: string | null; name_om: string | null };
export type VehicleRef = { id: string; plate: string; make: string | null; model: string | null };

const JOB_COLUMNS =
  "id, job_no, status, complaint, work_done, odometer_km, parts_total, labour_total, total, paid_total, balance, opened_at, ready_at, delivered_at, mechanic_id, gr_vehicles(id, plate, make, model), customers(id, name, phone), gr_mechanics(id, name)" as const;

export type JobDTO = {
  id: string;
  jobNo: number;
  status: JobStatus;
  complaint: string;
  workDone: string | null;
  odometerKm: number | null;
  partsTotal: number;
  labourTotal: number;
  total: number;
  paidTotal: number;
  balance: number;
  openedAt: string;
  readyAt: string | null;
  deliveredAt: string | null;
  mechanicId: string | null;
  mechanicName: string | null;
  vehicle: VehicleRef;
  customer: { id: string; name: string; phone: string | null };
};

type JobRow = {
  id: string; job_no: number; status: string; complaint: string; work_done: string | null; odometer_km: number | null;
  parts_total: number; labour_total: number; total: number; paid_total: number; balance: number;
  opened_at: string; ready_at: string | null; delivered_at: string | null; mechanic_id: string | null;
  gr_vehicles: VehicleRef; customers: { id: string; name: string; phone: string | null }; gr_mechanics: { id: string; name: string } | null;
};

function toJob(r: JobRow): JobDTO {
  return {
    id: r.id, jobNo: r.job_no, status: r.status as JobStatus, complaint: r.complaint, workDone: r.work_done,
    odometerKm: r.odometer_km, partsTotal: r.parts_total, labourTotal: r.labour_total, total: r.total,
    paidTotal: r.paid_total, balance: r.balance, openedAt: r.opened_at, readyAt: r.ready_at, deliveredAt: r.delivered_at,
    mechanicId: r.mechanic_id, mechanicName: r.gr_mechanics?.name ?? null,
    vehicle: r.gr_vehicles, customer: r.customers,
  };
}

const OPEN_STATUSES = ["open", "in_progress", "waiting_parts", "ready"];

function failure(message: string | undefined): Result<never> {
  return { ok: false, error: garageErrorKey(message) };
}

export function itemName(item: Names, locale: string): string {
  if (locale === "am" && item.name_am) return item.name_am;
  if (locale === "om" && item.name_om) return item.name_om;
  return item.name_en;
}

// ---- reads (RLS scopes every query to the caller's tenant) ----

export type VehicleHit = VehicleRef & { ownerName: string | null; ownerPhone: string | null };

export async function searchVehicles(query: string): Promise<VehicleHit[]> {
  const key = plateKey(query);
  if (key.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gr_vehicles")
    .select("id, plate, make, model, customers(name, phone)")
    .ilike("plate_key", `%${key}%`)
    .order("plate")
    .limit(20);
  if (error) throw error;
  return data.map((v) => ({
    id: v.id, plate: v.plate, make: v.make, model: v.model,
    ownerName: v.customers?.name ?? null, ownerPhone: v.customers?.phone ?? null,
  }));
}

export async function listOpenJobs(mechanicId?: string): Promise<JobDTO[]> {
  const supabase = await createClient();
  let q = supabase.from("gr_job_cards").select(JOB_COLUMNS).in("status", OPEN_STATUSES).order("opened_at").limit(100);
  if (mechanicId) q = q.eq("mechanic_id", mechanicId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as JobRow[]).map(toJob);
}

export async function listUnpaidJobs(): Promise<JobDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gr_job_cards")
    .select(JOB_COLUMNS)
    .gt("balance", 0)
    .neq("status", "cancelled")
    .order("opened_at")
    .limit(200);
  if (error) throw error;
  return (data as unknown as JobRow[]).map(toJob);
}

export async function getJob(id: string): Promise<JobDTO | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("gr_job_cards").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toJob(data as unknown as JobRow) : null;
}

export type JobLines = {
  parts: { id: string; name: string; qty: number; unitPrice: number; lineTotal: number }[];
  labour: { id: string; description: string; amount: number; mechanicName: string | null }[];
  payments: { id: string; amount: number; method: Enums<"pay_method">; createdAt: string }[];
};

export async function getJobLines(jobId: string, locale: string): Promise<JobLines> {
  const supabase = await createClient();
  const [parts, labour, payments] = await Promise.all([
    supabase.from("gr_job_parts").select("id, qty, unit_price, line_total, items(name_en, name_am, name_om)").eq("job_id", jobId).is("reversed_at", null).order("created_at"),
    supabase.from("gr_job_labour").select("id, description, amount, gr_mechanics(name)").eq("job_id", jobId).is("reversed_at", null).order("created_at"),
    supabase.from("gr_job_payments").select("id, amount, method, created_at").eq("job_id", jobId).order("created_at"),
  ]);
  if (parts.error) throw parts.error;
  if (labour.error) throw labour.error;
  if (payments.error) throw payments.error;
  return {
    parts: parts.data.map((p) => ({
      id: p.id, name: p.items ? itemName(p.items, locale) : "", qty: p.qty, unitPrice: p.unit_price, lineTotal: p.line_total,
    })),
    labour: labour.data.map((l) => ({ id: l.id, description: l.description, amount: l.amount, mechanicName: l.gr_mechanics?.name ?? null })),
    payments: payments.data.map((p) => ({ id: p.id, amount: p.amount, method: p.method, createdAt: p.created_at })),
  };
}

export type VehicleHistory = {
  vehicle: VehicleRef & { color: string | null; year: number | null; ownerName: string | null; ownerPhone: string | null };
  jobs: (JobDTO & { lines: JobLines })[];
};

/** Everything ever done to a vehicle, newest first. Reversed lines are left out. */
export async function getVehicleHistory(id: string, locale: string): Promise<VehicleHistory | null> {
  const supabase = await createClient();
  const [vehicle, jobs] = await Promise.all([
    supabase.from("gr_vehicles").select("id, plate, make, model, color, year, customers(name, phone)").eq("id", id).maybeSingle(),
    supabase.from("gr_job_cards").select(JOB_COLUMNS).eq("vehicle_id", id).neq("status", "cancelled").order("opened_at", { ascending: false }).limit(100),
  ]);
  if (vehicle.error) throw vehicle.error;
  if (jobs.error) throw jobs.error;
  if (!vehicle.data) return null;
  const list = (jobs.data as unknown as JobRow[]).map(toJob);
  const lines = await Promise.all(list.map((j) => getJobLines(j.id, locale)));
  return {
    vehicle: {
      id: vehicle.data.id, plate: vehicle.data.plate, make: vehicle.data.make, model: vehicle.data.model,
      color: vehicle.data.color, year: vehicle.data.year,
      ownerName: vehicle.data.customers?.name ?? null, ownerPhone: vehicle.data.customers?.phone ?? null,
    },
    jobs: list.map((j, i) => ({ ...j, lines: lines[i] })),
  };
}

export type MechanicDTO = { id: string; name: string; phone: string | null; active: boolean };

export async function listMechanics(activeOnly = true): Promise<MechanicDTO[]> {
  const supabase = await createClient();
  let q = supabase.from("gr_mechanics").select("id, name, phone, active").order("name");
  if (activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export type PartDTO = { id: string; name: string; sku: string | null; unit: string; price: number; cost: number; reorderLevel: number; onHand: number };

export async function listParts(locale: string, search?: string): Promise<PartDTO[]> {
  const supabase = await createClient();
  let q = supabase
    .from("items")
    .select("id, sku, name_en, name_am, name_om, unit, price, cost, reorder_level")
    .eq("active", true)
    .order("name_en")
    .limit(300);
  const term = search?.replace(/[%,()]/g, " ").trim();
  if (term) q = q.or(`name_en.ilike.%${term}%,name_am.ilike.%${term}%,name_om.ilike.%${term}%,sku.ilike.%${term}%`);
  const [items, stock] = await Promise.all([q, supabase.from("item_stock").select("item_id, qty_on_hand")]);
  if (items.error) throw items.error;
  if (stock.error) throw stock.error;
  const onHand = new Map(stock.data.map((s) => [s.item_id, s.qty_on_hand ?? 0]));
  return items.data.map((i) => ({
    id: i.id, name: itemName(i, locale), sku: i.sku, unit: i.unit, price: i.price, cost: i.cost,
    reorderLevel: i.reorder_level, onHand: onHand.get(i.id) ?? 0,
  }));
}

// ---- writes ----

function requireManager(role: string): boolean {
  return role === "owner" || role === "manager";
}

export async function openJob(input: {
  plate: string; complaint: string; customerName?: string; customerPhone?: string;
  make?: string; model?: string; mechanic?: string; odometer?: number; clientRef: string;
}): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gr_open_job", {
    p_plate: input.plate, p_complaint: input.complaint, p_customer_name: input.customerName, p_customer_phone: input.customerPhone,
    p_make: input.make, p_model: input.model, p_mechanic: input.mechanic, p_odometer: input.odometer, p_client_ref: input.clientRef,
  });
  return error ? failure(error.message) : { ok: true, data };
}

export async function addPart(input: { job: string; item: string; qty: number; unitPrice?: number; clientRef: string }): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gr_add_part", { p_job: input.job, p_item: input.item, p_qty: input.qty, p_unit_price: input.unitPrice, p_client_ref: input.clientRef });
  return error ? failure(error.message) : { ok: true, data: undefined };
}

export async function reversePart(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gr_reverse_part", { p_part: id });
  return error ? failure(error.message) : { ok: true, data: undefined };
}

export async function addLabour(input: { job: string; description: string; amount: number; mechanic?: string; clientRef: string }): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gr_add_labour", { p_job: input.job, p_description: input.description, p_amount: input.amount, p_mechanic: input.mechanic, p_client_ref: input.clientRef });
  return error ? failure(error.message) : { ok: true, data: undefined };
}

export async function reverseLabour(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gr_reverse_labour", { p_labour: id });
  return error ? failure(error.message) : { ok: true, data: undefined };
}

export async function payJob(input: { job: string; amount: number; method: Enums<"pay_method">; reference?: string; clientRef: string }): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gr_pay_job", { p_job: input.job, p_amount: input.amount, p_method: input.method, p_reference: input.reference, p_client_ref: input.clientRef });
  return error ? failure(error.message) : { ok: true, data: undefined };
}

export async function updateJob(input: { job: string; mechanic?: string; workDone?: string; odometer?: number }): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gr_update_job", { p_job: input.job, p_mechanic: input.mechanic, p_work_done: input.workDone, p_odometer: input.odometer });
  return error ? failure(error.message) : { ok: true, data: undefined };
}

export async function setJobStatus(input: { job: string; status: JobStatus; due?: string }): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gr_set_status", { p_job: input.job, p_status: input.status, p_due: input.due });
  return error ? failure(error.message) : { ok: true, data: undefined };
}

export async function addMechanic(input: { name: string; phone?: string }): Promise<Result> {
  const { profile } = await getSession();
  if (!requireManager(profile.role)) return { ok: false, error: "not_allowed" };
  const supabase = await createClient();
  const { error } = await supabase.from("gr_mechanics").insert({ name: input.name, phone: input.phone });
  if (error) return { ok: false, error: error.code === "23505" ? "mechanic_exists" : garageErrorKey(error.message) };
  return { ok: true, data: undefined };
}

export async function setMechanicActive(input: { mechanic: string; active: boolean }): Promise<Result> {
  const { profile } = await getSession();
  if (!requireManager(profile.role)) return { ok: false, error: "not_allowed" };
  const supabase = await createClient();
  const { error } = await supabase.from("gr_mechanics").update({ active: input.active }).eq("id", input.mechanic);
  return error ? failure(error.message) : { ok: true, data: undefined };
}

export async function addPartItem(input: { name: string; sku?: string; unit: string; price: number; cost: number; reorder: number; openingQty?: number }): Promise<Result> {
  const { profile } = await getSession();
  if (!requireManager(profile.role)) return { ok: false, error: "not_allowed" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert({ name_en: input.name, sku: input.sku, unit: input.unit, price: input.price, cost: input.cost, reorder_level: input.reorder })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "sku_taken" : garageErrorKey(error.message) };
  if (input.openingQty) {
    const { error: stockError } = await supabase.rpc("receive_stock", { p_item: data.id, p_qty: input.openingQty, p_cost: input.cost });
    if (stockError) return failure(stockError.message);
  }
  return { ok: true, data: undefined };
}

export async function receiveStock(input: { item: string; qty: number; cost: number }): Promise<Result> {
  const { profile } = await getSession();
  if (!requireManager(profile.role)) return { ok: false, error: "not_allowed" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_stock", { p_item: input.item, p_qty: input.qty, p_cost: input.cost });
  return error ? failure(error.message) : { ok: true, data: undefined };
}

/** Only the empty demo tenant can load the seed; the database checks owner and name. */
export async function loadDemoData(): Promise<Result<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gr_load_demo_data");
  if (error) return failure(error.message);
  return { ok: true, data };
}

export type CustomerRow = { id: string; name: string; phone: string | null; balance: number };

export async function listCustomers(search?: string): Promise<CustomerRow[]> {
  const supabase = await createClient();
  let q = supabase.from("customer_balances").select("customer_id, name, phone, balance").order("name").limit(200);
  const term = search?.replace(/[%,()]/g, " ").trim();
  if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data.flatMap((c) => (c.customer_id ? [{ id: c.customer_id, name: c.name ?? "", phone: c.phone, balance: c.balance ?? 0 }] : []));
}

export type CustomerDetail = {
  customer: CustomerRow;
  vehicles: VehicleRef[];
  unpaidJobs: JobDTO[];
  ledger: { id: string; type: string; amount: number; dueDate: string | null; createdAt: string }[];
};

export async function getCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const supabase = await createClient();
  const [customer, balance, vehicles, jobs, ledger] = await Promise.all([
    supabase.from("customers").select("id, name, phone").eq("id", id).maybeSingle(),
    supabase.from("customer_balances").select("balance").eq("customer_id", id).maybeSingle(),
    supabase.from("gr_vehicles").select("id, plate, make, model").eq("customer_id", id).order("plate"),
    supabase.from("gr_job_cards").select(JOB_COLUMNS).eq("customer_id", id).gt("balance", 0).neq("status", "cancelled").order("opened_at"),
    supabase.from("credit_ledger").select("id, type, amount, due_date, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  for (const r of [customer, balance, vehicles, jobs, ledger]) if (r.error) throw r.error;
  if (!customer.data) return null;
  return {
    customer: { id: customer.data.id, name: customer.data.name, phone: customer.data.phone, balance: balance.data?.balance ?? 0 },
    vehicles: vehicles.data ?? [],
    unpaidJobs: ((jobs.data ?? []) as unknown as JobRow[]).map(toJob),
    ledger: (ledger.data ?? []).map((l) => ({ id: l.id, type: l.type, amount: l.amount, dueDate: l.due_date, createdAt: l.created_at })),
  };
}

export type ReportDayDTO = { day: string; jobsDelivered: number; parts: number; labour: number; collected: number };

/** Per Addis Ababa day: jobs handed over, their parts and labour value, and money collected. */
export async function dailyReport(from: string, to: string): Promise<ReportDayDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gr_daily_report", { p_from: from, p_to: to });
  if (error) throw new Error("report_unavailable");
  return (data ?? []).map((d) => ({
    day: d.day,
    jobsDelivered: d.jobs_delivered,
    parts: Number(d.parts),
    labour: Number(d.labour),
    collected: Number(d.collected),
  }));
}

export type MechanicLabourDTO = { mechanicId: string | null; name: string | null; jobs: number; labour: number };

/** Labour booked per mechanic in the range, biggest first; lines with no mechanic come back with a null name. */
export async function labourByMechanic(from: string, to: string): Promise<MechanicLabourDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gr_labour_by_mechanic", { p_from: from, p_to: to });
  if (error) throw new Error("report_unavailable");
  return (data ?? []).map((m) => ({ mechanicId: m.mechanic_id, name: m.mechanic_name, jobs: m.jobs, labour: Number(m.labour) }));
}
