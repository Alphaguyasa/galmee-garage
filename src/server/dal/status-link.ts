import "server-only";
import { garageErrorKey } from "@/lib/garage-errors";
import { isStatusToken } from "@/lib/status-link";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/server/validation";
import type { Result } from "@/server/dal/garage";

/** The live courtesy link of a job, if one is switched on. */
export async function getStatusLinkToken(jobId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gr_status_links")
    .select("token")
    .eq("job_id", jobId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data?.token ?? null;
}

/** Switches the link on (any role in the garage may share it). Reuses a live link. */
export async function createStatusLink(jobId: string): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("gr_status_links").insert({ job_id: jobId }).select("token").single();
  if (!error) return { ok: true, data: data.token };
  if (error.code === "23505") {
    const token = await getStatusLinkToken(jobId);
    if (token) return { ok: true, data: token };
  }
  return { ok: false, error: error.code === "P0002" || error.code === "23503" ? "job_not_found" : garageErrorKey(error.message) };
}

/** Switches the link off: the customer's page stops showing the job at once. */
export async function revokeStatusLink(jobId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gr_status_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .is("revoked_at", null);
  return error ? { ok: false, error: garageErrorKey(error.message) } : { ok: true, data: undefined };
}

export type PublicJobStatus = {
  garageName: string;
  garagePhone: string | null;
  plate: string;
  vehicleLabel: string | null;
  jobNo: number;
  status: JobStatus;
  openedAt: string;
  readyAt: string | null;
  deliveredAt: string | null;
  total: number;
  balance: number;
};

/**
 * Reads a job for the public status page as anon. The token travels in a request
 * header and the database policies only return the one job it belongs to.
 * Returns null for an unknown, switched-off or expired link.
 */
export async function getPublicJobStatus(token: string): Promise<PublicJobStatus | null> {
  if (!isStatusToken(token)) return null;
  const supabase = createAnonClient({ "x-status-token": token });
  const { data: link, error: linkError } = await supabase
    .from("gr_status_links")
    .select("job_id, garage_name, garage_phone, plate, vehicle_label")
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return null;
  const { data: job, error: jobError } = await supabase
    .from("gr_job_cards")
    .select("id, job_no, status, opened_at, ready_at, delivered_at, total, balance")
    .eq("id", link.job_id)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job) return null;
  return {
    garageName: link.garage_name,
    garagePhone: link.garage_phone,
    plate: link.plate,
    vehicleLabel: link.vehicle_label,
    jobNo: job.job_no,
    status: job.status as JobStatus,
    openedAt: job.opened_at,
    readyAt: job.ready_at,
    deliveredAt: job.delivered_at,
    total: Number(job.total),
    balance: Number(job.balance),
  };
}
