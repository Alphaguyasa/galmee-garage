"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INVITE_CODE, normalizeCode, type RedeemStatus } from "@/lib/galmee/staff";
import { getSession } from "@/server/dal/session";
import { createInvite, redeemInvite, revokeInvite, setStaffActive, setStaffRole, type StaffActionResult } from "@/server/dal/staff";

const uuid = z.string().uuid();
const inviteSchema = z.object({
  role: z.enum(["manager", "staff"]),
  name: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(20).regex(/^[+0-9 ]*$/).optional().default(""),
});

/** Owner and manager only here as well; the RPCs check the same and which role each may invite. */
async function canInvite() {
  const { profile } = await getSession();
  return profile.role === "owner" || profile.role === "manager";
}
async function isOwner() {
  const { profile } = await getSession();
  return profile.role === "owner";
}

export async function inviteStaff(input: unknown): Promise<StaffActionResult<{ code: string; expires_at: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "generic" };
  if (!(await canInvite())) return { ok: false, code: "forbidden" };
  const result = await createInvite(parsed.data);
  if (result.ok) revalidatePath("/staff");
  return result;
}

export async function revokeStaffInvite(id: unknown): Promise<StaffActionResult> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, code: "generic" };
  if (!(await canInvite())) return { ok: false, code: "forbidden" };
  const result = await revokeInvite(parsed.data);
  if (result.ok) revalidatePath("/staff");
  return result;
}

export async function changeStaffRole(userId: unknown, role: unknown): Promise<StaffActionResult> {
  const parsed = z.object({ userId: uuid, role: z.enum(["owner", "manager", "staff"]) }).safeParse({ userId, role });
  if (!parsed.success) return { ok: false, code: "generic" };
  if (!(await isOwner())) return { ok: false, code: "forbidden" };
  const result = await setStaffRole(parsed.data.userId, parsed.data.role);
  if (result.ok) revalidatePath("/staff");
  return result;
}

export async function changeStaffActive(userId: unknown, active: unknown): Promise<StaffActionResult> {
  const parsed = z.object({ userId: uuid, active: z.boolean() }).safeParse({ userId, active });
  if (!parsed.success) return { ok: false, code: "generic" };
  if (!(await isOwner())) return { ok: false, code: "forbidden" };
  const result = await setStaffActive(parsed.data.userId, parsed.data.active);
  if (result.ok) revalidatePath("/staff");
  return result;
}

/** Join with a code. The caller has an account but no business yet (checked by the RPC). */
export async function joinWithCode(code: unknown, fullName: unknown): Promise<RedeemStatus> {
  const parsed = z
    .object({ code: z.string().transform(normalizeCode).pipe(z.string().regex(INVITE_CODE)), fullName: z.string().trim().max(80) })
    .safeParse({ code, fullName });
  if (!parsed.success) return "bad_code";
  return redeemInvite(parsed.data.code, parsed.data.fullName);
}
