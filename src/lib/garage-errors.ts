const KNOWN = [
  "bad_plate", "complaint_required", "customer_required", "customer_not_found", "mechanic_not_found",
  "vehicle_has_open_job", "job_not_found", "job_closed", "bad_qty", "item_not_found",
  "price_override_not_allowed", "bad_amount", "insufficient_stock", "part_not_found", "already_reversed",
  "description_required", "labour_not_found", "overpayment", "bad_status", "job_has_payments", "job_has_lines",
  "balance_due", "not_allowed",
] as const;

export type GarageErrorKey = (typeof KNOWN)[number] | "mechanic_exists" | "sku_taken" | "generic";

/** Turns a database error message into a translation key; anything unknown stays generic. */
export function garageErrorKey(message: string | undefined): GarageErrorKey {
  return KNOWN.find((code) => message?.includes(code)) ?? "generic";
}
