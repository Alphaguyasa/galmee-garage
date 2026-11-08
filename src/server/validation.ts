import { z } from "zod";

export const MIN_PASSWORD = 10;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().max(128),
});

export const signupSchema = credentialsSchema.extend({
  password: z.string().min(MIN_PASSWORD).max(128),
});

// Ethiopian mobile/landline: 09xxxxxxxx, 07xxxxxxxx or +2519xxxxxxxx; spaces and dashes allowed.
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+251|0)[1-9]\d{8}$/));

export const onboardingSchema = z.object({
  garageName: z.string().trim().min(2).max(120),
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
});

export function formToObject(formData: FormData, keys: readonly string[]) {
  return Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? ""]));
}

const uuid = z.string().uuid();
const money = z.coerce.number().positive().max(100_000_000);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined);
const optionalUuid = z.union([z.literal(""), uuid]).transform((v) => v || undefined);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const uuidParam = uuid;
export const plateParam = z.string().trim().max(24);

export const JOB_STATUSES = ["open", "in_progress", "waiting_parts", "ready", "delivered", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const PAY_METHODS = ["cash", "telebirr", "cbe_birr", "bank", "other"] as const;

export const newJobSchema = z.object({
  plate: z.string().trim().min(2).max(20),
  complaint: z.string().trim().min(2).max(1000),
  customerName: optionalText(120),
  customerPhone: z.union([z.literal(""), phoneSchema]).transform((v) => v || undefined),
  make: optionalText(60),
  model: optionalText(60),
  mechanic: optionalUuid,
  odometer: z.union([z.literal(""), z.coerce.number().int().min(0).max(5_000_000)]).transform((v) => (v === "" ? undefined : v)),
  clientRef: uuid,
});

export const addPartSchema = z.object({
  job: uuid,
  item: uuid,
  qty: z.coerce.number().positive().max(100_000),
  unitPrice: z.union([z.literal(""), z.coerce.number().min(0).max(100_000_000)]).transform((v) => (v === "" ? undefined : v)),
  clientRef: uuid,
});

export const addLabourSchema = z.object({
  job: uuid,
  description: z.string().trim().min(2).max(200),
  amount: money,
  mechanic: optionalUuid,
  clientRef: uuid,
});

export const reverseSchema = z.object({ job: uuid, id: uuid });

export const payJobSchema = z.object({
  job: uuid,
  amount: money,
  method: z.enum(PAY_METHODS),
  reference: optionalText(80),
  clientRef: uuid,
});

export const updateJobSchema = z.object({
  job: uuid,
  mechanic: optionalUuid,
  workDone: optionalText(2000),
  odometer: z.union([z.literal(""), z.coerce.number().int().min(0).max(5_000_000)]).transform((v) => (v === "" ? undefined : v)),
});

export const setStatusSchema = z.object({
  job: uuid,
  status: z.enum(JOB_STATUSES),
  due: z.union([z.literal(""), day]).transform((v) => v || undefined),
});

export const mechanicSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.union([z.literal(""), phoneSchema]).transform((v) => v || undefined),
});
export const mechanicIdSchema = z.object({ mechanic: uuid, active: z.enum(["true", "false"]) });

export const itemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: optionalText(40),
  unit: z.string().trim().min(1).max(12),
  price: z.coerce.number().min(0).max(100_000_000),
  cost: z.coerce.number().min(0).max(100_000_000),
  reorder: z.coerce.number().min(0).max(1_000_000),
  openingQty: z.union([z.literal(""), z.coerce.number().positive().max(1_000_000)]).transform((v) => (v === "" ? undefined : v)),
});

export const receiveSchema = z.object({
  item: uuid,
  qty: z.coerce.number().positive().max(1_000_000),
  cost: z.coerce.number().min(0).max(100_000_000),
});
