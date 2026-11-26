import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redeemStatus, staffErrorKey, type RedeemStatus, type StaffErrorKey, type StaffInvite, type StaffMember, type StaffRole } from "@/lib/galmee/staff";
import { getSession, getUserId } from "./session";

/**
 * Staff membership through the shared kit RPCs (staff_create_invite, staff_revoke_invite,
 * staff_set_role, staff_set_active, staff_redeem_invite). The server enforces every rule
 * (who may invite which role, last owner, no self-change); this layer only maps answers.
 * staff_invites and these RPCs are newer than the generated types, so calls go through a
 * narrow local type.
 */
type RpcResult = { data: unknown; error: { message: string } | null };
type Db = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  from(table: "staff_invites"): {
    select(columns: string): { order(column: string, opts: { ascending: boolean }): { limit(n: number): PromiseLike<RpcResult> } };
  };
};

async function db(): Promise<Db> {
  return (await createClient()) as unknown as Db;
}

export type StaffOverviewDTO = { members: StaffMember[]; invites: StaffInvite[] };

/** Members of this garage and its invites (invites are readable by owner and manager only). */
export async function getStaffOverview(): Promise<StaffOverviewDTO> {
  const session = await getSession();
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("user_id, full_name, phone, role, active")
    .order("created_at");

  let invites: StaffInvite[] = [];
  if (session.profile.role === "owner" || session.profile.role === "manager") {
    const { data } = await (await db())
      .from("staff_invites")
      .select("id, code, role, display_name, phone, expires_at, used_at")
      .order("created_at", { ascending: false })
      .limit(50);
    invites = (data ?? []) as StaffInvite[];
  }
  return { members: (members ?? []) as StaffMember[], invites };
}

export type StaffActionResult<T = true> = { ok: true; data: T } | { ok: false; code: StaffErrorKey };

export async function createInvite(input: {
  role: Exclude<StaffRole, "owner">;
  name?: string;
  phone?: string;
}): Promise<StaffActionResult<{ code: string; expires_at: string }>> {
  await getSession();
  const { data, error } = await (await db()).rpc("staff_create_invite", {
    p_role: input.role,
    p_name: input.name || null,
    p_phone: input.phone || null,
  });
  if (error) return { ok: false, code: staffErrorKey(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { code?: string; expires_at?: string } | undefined;
  if (!row?.code || !row.expires_at) return { ok: false, code: "generic" };
  return { ok: true, data: { code: row.code, expires_at: row.expires_at } };
}

async function call(fn: string, args: Record<string, unknown>): Promise<StaffActionResult> {
  await getSession();
  const { error } = await (await db()).rpc(fn, args);
  return error ? { ok: false, code: staffErrorKey(error.message) } : { ok: true, data: true };
}

export const revokeInvite = (id: string) => call("staff_revoke_invite", { p_id: id });
export const setStaffRole = (userId: string, role: StaffRole) => call("staff_set_role", { p_user: userId, p_role: role });
export const setStaffActive = (userId: string, active: boolean) => call("staff_set_active", { p_user: userId, p_active: active });

/** Joining needs a signed-in user without a business yet; it does not use getSession (that sends them to onboarding). */
export async function redeemInvite(code: string, fullName: string): Promise<RedeemStatus> {
  if (!(await getUserId())) return "not_signed_in";
  const { data, error } = await (await db()).rpc("staff_redeem_invite", { p_code: code, p_full_name: fullName || null });
  return redeemStatus((Array.isArray(data) ? data[0] : data) as { status?: string } | null, error?.message);
}
