import type { JobStatus } from "@/server/validation";

/** Tokens are 24 random bytes from the database, hex encoded. */
export const STATUS_TOKEN = /^[0-9a-f]{48}$/;

export function isStatusToken(value: string): boolean {
  return STATUS_TOKEN.test(value);
}

export type StepKey = "received" | "in_progress" | "waiting_parts" | "ready" | "delivered";
export type StepState = "done" | "current" | "todo";

/**
 * The customer's view of a job as a short list of steps. "Waiting for parts" is only
 * shown while the job is actually waiting, so a normal job reads as four steps.
 */
export function customerSteps(status: JobStatus): { key: StepKey; state: StepState }[] | null {
  if (status === "cancelled") return null;
  const keys: StepKey[] =
    status === "waiting_parts"
      ? ["received", "in_progress", "waiting_parts", "ready", "delivered"]
      : ["received", "in_progress", "ready", "delivered"];
  const current: StepKey = status === "open" ? "received" : status;
  const at = keys.indexOf(current);
  return keys.map((key, i) => ({
    key,
    state: i < at || (status === "delivered" && i === at) ? "done" : i === at ? "current" : "todo",
  }));
}

/** Shown on the public page only once the car is ready or handed over. */
export function showAmountDue(status: JobStatus, balance: number): boolean {
  return (status === "ready" || status === "delivered") && balance > 0;
}
