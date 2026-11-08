"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as garage from "@/server/dal/garage";
import { getUserId } from "@/server/dal/session";
import {
  addLabourSchema,
  addPartSchema,
  formToObject,
  itemSchema,
  mechanicIdSchema,
  mechanicSchema,
  newJobSchema,
  payJobSchema,
  receiveSchema,
  reverseSchema,
  setStatusSchema,
  updateJobSchema,
} from "@/server/validation";

/** `error` is a key in the `errors` message namespace. */
export type ActionState = { error?: string; done?: boolean } | undefined;

// Server Actions are public endpoints: every one checks the login and validates; the RPCs re-check tenant and role.
async function requireLogin() {
  if (!(await getUserId())) redirect("/login");
}

function refreshJob(job: string) {
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/unpaid");
  revalidatePath("/parts");
  revalidatePath(`/jobs/${job}`);
}

export async function openJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = newJobSchema.safeParse(formToObject(formData, ["plate", "complaint", "customerName", "customerPhone", "make", "model", "mechanic", "odometer", "clientRef"]));
  if (!parsed.success) return { error: parsed.error.issues[0]?.path[0] === "customerPhone" ? "phone" : "form" };
  const result = await garage.openJob(parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/");
  redirect(`/jobs/${result.data}`);
}

export async function addPartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = addPartSchema.safeParse(formToObject(formData, ["job", "item", "qty", "unitPrice", "clientRef"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.addPart(parsed.data);
  if (!result.ok) return { error: result.error };
  refreshJob(parsed.data.job);
  return { done: true };
}

export async function reversePartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = reverseSchema.safeParse(formToObject(formData, ["job", "id"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.reversePart(parsed.data.id);
  if (!result.ok) return { error: result.error };
  refreshJob(parsed.data.job);
  return { done: true };
}

export async function addLabourAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = addLabourSchema.safeParse(formToObject(formData, ["job", "description", "amount", "mechanic", "clientRef"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.addLabour(parsed.data);
  if (!result.ok) return { error: result.error };
  refreshJob(parsed.data.job);
  return { done: true };
}

export async function reverseLabourAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = reverseSchema.safeParse(formToObject(formData, ["job", "id"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.reverseLabour(parsed.data.id);
  if (!result.ok) return { error: result.error };
  refreshJob(parsed.data.job);
  return { done: true };
}

export async function payJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = payJobSchema.safeParse(formToObject(formData, ["job", "amount", "method", "reference", "clientRef"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.payJob(parsed.data);
  if (!result.ok) return { error: result.error };
  refreshJob(parsed.data.job);
  return { done: true };
}

export async function updateJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = updateJobSchema.safeParse(formToObject(formData, ["job", "mechanic", "workDone", "odometer"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.updateJob(parsed.data);
  if (!result.ok) return { error: result.error };
  refreshJob(parsed.data.job);
  return { done: true };
}

export async function setStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = setStatusSchema.safeParse(formToObject(formData, ["job", "status", "due"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.setJobStatus(parsed.data);
  if (!result.ok) return { error: result.error };
  refreshJob(parsed.data.job);
  return { done: true };
}

export async function addMechanicAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = mechanicSchema.safeParse(formToObject(formData, ["name", "phone"]));
  if (!parsed.success) return { error: parsed.error.issues[0]?.path[0] === "phone" ? "phone" : "form" };
  const result = await garage.addMechanic(parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings");
  return { done: true };
}

export async function setMechanicActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = mechanicIdSchema.safeParse(formToObject(formData, ["mechanic", "active"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.setMechanicActive({ mechanic: parsed.data.mechanic, active: parsed.data.active === "true" });
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings");
  return { done: true };
}

export async function addItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = itemSchema.safeParse(formToObject(formData, ["name", "sku", "unit", "price", "cost", "reorder", "openingQty"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.addPartItem(parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/parts");
  return { done: true };
}

export async function receiveStockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireLogin();
  const parsed = receiveSchema.safeParse(formToObject(formData, ["item", "qty", "cost"]));
  if (!parsed.success) return { error: "form" };
  const result = await garage.receiveStock(parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/parts");
  return { done: true };
}

export async function loadDemoDataAction(): Promise<ActionState> {
  await requireLogin();
  const result = await garage.loadDemoData();
  if (!result.ok) return { error: result.error };
  revalidatePath("/");
  revalidatePath("/parts");
  return { done: true };
}
