import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  addLabourAction,
  addPartAction,
  payJobAction,
  reverseLabourAction,
  reversePartAction,
  setStatusAction,
  updateJobAction,
} from "@/actions/garage";
import { ActionForm } from "@/components/garage/action-form";
import { DateField, SelectField } from "@/components/garage/fields";
import { StatusTag } from "@/components/garage/job-row";
import { Plate } from "@/components/garage/plate";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/money";
import { getJob, getJobLines, listMechanics, listParts } from "@/server/dal/garage";
import { getSession } from "@/server/dal/session";
import { PAY_METHODS, uuidParam, type JobStatus } from "@/server/validation";

const NEXT: Record<JobStatus, JobStatus[]> = {
  open: ["in_progress", "waiting_parts", "ready"],
  in_progress: ["waiting_parts", "ready"],
  waiting_parts: ["in_progress", "ready"],
  ready: ["delivered", "in_progress"],
  delivered: [],
  cancelled: [],
};
const STATUS_LABEL: Partial<Record<JobStatus, "markInRepair" | "markWaitingParts" | "markReady" | "deliver">> = {
  in_progress: "markInRepair",
  waiting_parts: "markWaitingParts",
  ready: "markReady",
  delivered: "deliver",
};
const addisToday = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const locale = (await getLocale()) as Locale;
  const [job, lines, mechanics, parts, { profile }, t] = await Promise.all([
    getJob(id),
    getJobLines(id, locale),
    listMechanics(),
    listParts(locale),
    getSession(),
    getTranslations("job"),
  ]);
  if (!job) notFound();
  const tNew = await getTranslations("newJob");
  const tJobs = await getTranslations("jobs");
  const open = job.status !== "delivered" && job.status !== "cancelled";
  const canManage = profile.role !== "staff";
  const vehicleName = [job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ");
  const nextSteps = NEXT[job.status];

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/vehicles/${job.vehicle.id}`} aria-label={t("history")}>
            <Plate plate={job.vehicle.plate} className="text-xl" />
          </Link>
          <StatusTag status={job.status} />
        </div>
        <h1 className="text-[1.5625rem] leading-tight font-bold text-balance break-words">{job.complaint}</h1>
        <p className="text-sm text-muted-foreground">
          {tJobs("jobNo", { no: job.jobNo })} · {t("openedOn", { date: formatEthiopianDate(job.openedAt.slice(0, 10), locale) })}
          {vehicleName ? ` · ${vehicleName}` : ""}
        </p>
        <p>
          <Link href={`/customers/${job.customer.id}`} className="underline underline-offset-4">
            {job.customer.name}
          </Link>
          {job.customer.phone ? (
            <>
              {" · "}
              <a href={`tel:${job.customer.phone}`} className="num underline underline-offset-4">
                {job.customer.phone}
              </a>
            </>
          ) : null}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-card p-4 md:max-w-sm" aria-label={t("total")}>
        <span className="text-muted-foreground">{t("partsTotal")}</span>
        <span className="num text-right">{formatBirr(job.partsTotal, locale)}</span>
        <span className="text-muted-foreground">{t("labourTotal")}</span>
        <span className="num text-right">{formatBirr(job.labourTotal, locale)}</span>
        <span className="font-semibold">{t("total")}</span>
        <span className="num text-right font-semibold">{formatBirr(job.total, locale)}</span>
        <span className="text-muted-foreground">{t("paid")}</span>
        <span className="num text-right">{formatBirr(job.paidTotal, locale)}</span>
        <span className="font-semibold">{t("balance")}</span>
        <span className={`num text-right text-lg font-bold ${job.balance > 0 ? "text-destructive" : ""}`}>{formatBirr(job.balance, locale)}</span>
      </section>

      <Link href={`/jobs/${job.id}/invoice`} className={`${buttonVariants({ variant: "outline", size: "lg" })} md:max-w-sm`}>
        <Printer aria-hidden />
        {t("printInvoice")}
      </Link>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">{t("partsTitle")}</h2>
        {lines.parts.length === 0 ? (
          <p className="text-muted-foreground">{t("noParts")}</p>
        ) : (
          <ul>
            {lines.parts.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 border-b py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{p.name}</span>
                  <span className="num text-sm text-muted-foreground">
                    {p.qty} × {formatBirr(p.unitPrice, locale)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num font-medium whitespace-nowrap">{formatBirr(p.lineTotal, locale)}</span>
                  {open ? (
                    <ActionForm action={reversePartAction} submitLabel={t("remove")} variant="outline" className="inline">
                      <input type="hidden" name="job" value={job.id} />
                      <input type="hidden" name="id" value={p.id} />
                    </ActionForm>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {open && parts.length > 0 ? (
          <ActionForm action={addPartAction} submitLabel={t("addPart")} doneLabel={t("saved")}>
            <input type="hidden" name="job" value={job.id} />
            <input type="hidden" name="clientRef" value={randomUUID()} />
            <SelectField
              name="item"
              label={t("part")}
              options={parts.map((p) => ({ value: p.id, label: t("partOption", { name: p.name, onHand: p.onHand }) }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="qty">{t("qty")}</Label>
                <Input id="qty" name="qty" inputMode="decimal" required defaultValue="1" />
              </div>
              {canManage ? (
                <div className="grid gap-2">
                  <Label htmlFor="unitPrice">{t("price")}</Label>
                  <Input id="unitPrice" name="unitPrice" inputMode="decimal" />
                </div>
              ) : (
                <input type="hidden" name="unitPrice" value="" />
              )}
            </div>
          </ActionForm>
        ) : null}
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">{t("labourTitle")}</h2>
        {lines.labour.length === 0 ? (
          <p className="text-muted-foreground">{t("noLabour")}</p>
        ) : (
          <ul>
            {lines.labour.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 border-b py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{l.description}</span>
                  {l.mechanicName ? <span className="text-sm text-muted-foreground">{l.mechanicName}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num font-medium whitespace-nowrap">{formatBirr(l.amount, locale)}</span>
                  {open ? (
                    <ActionForm action={reverseLabourAction} submitLabel={t("remove")} variant="outline" className="inline">
                      <input type="hidden" name="job" value={job.id} />
                      <input type="hidden" name="id" value={l.id} />
                    </ActionForm>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {open ? (
          <ActionForm action={addLabourAction} submitLabel={t("addLabour")} doneLabel={t("saved")}>
            <input type="hidden" name="job" value={job.id} />
            <input type="hidden" name="clientRef" value={randomUUID()} />
            <input type="hidden" name="mechanic" value={job.mechanicId ?? ""} />
            <div className="grid gap-2">
              <Label htmlFor="description">{t("description")}</Label>
              <Input id="description" name="description" required maxLength={200} autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">{t("amount")}</Label>
              <Input id="amount" name="amount" inputMode="decimal" required />
            </div>
          </ActionForm>
        ) : null}
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">{t("payments")}</h2>
        {lines.payments.length === 0 ? (
          <p className="text-muted-foreground">{t("noPayments")}</p>
        ) : (
          <ul>
            {lines.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 border-b py-2">
                <span className="text-muted-foreground">
                  {t(`methods.${p.method === "chapa" ? "other" : p.method}`)} · {formatEthiopianDate(p.createdAt.slice(0, 10), locale)}
                </span>
                <span className="num shrink-0 whitespace-nowrap">{formatBirr(p.amount, locale)}</span>
              </li>
            ))}
          </ul>
        )}
        {job.balance > 0 && job.status !== "cancelled" ? (
          <ActionForm action={payJobAction} submitLabel={t("recordPayment")} doneLabel={t("saved")}>
            <input type="hidden" name="job" value={job.id} />
            <input type="hidden" name="clientRef" value={randomUUID()} />
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="payAmount">{t("amount")}</Label>
                <Input id="payAmount" name="amount" inputMode="decimal" required defaultValue={job.balance} />
              </div>
              <SelectField name="method" label={t("method")} options={PAY_METHODS.map((m) => ({ value: m, label: t(`methods.${m}`) }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reference">{t("reference")}</Label>
              <Input id="reference" name="reference" maxLength={80} autoComplete="off" />
            </div>
          </ActionForm>
        ) : null}
      </section>

      {open ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t("details")}</h2>
          <ActionForm action={updateJobAction} submitLabel={t("saveDetails")} doneLabel={t("saved")} variant="outline">
            <input type="hidden" name="job" value={job.id} />
            <SelectField
              name="mechanic"
              label={tNew("mechanic")}
              defaultValue={job.mechanicId ?? ""}
              options={[{ value: "", label: tJobs("noMechanic") }, ...mechanics.map((m) => ({ value: m.id, label: m.name }))]}
            />
            <div className="grid gap-2">
              <Label htmlFor="workDone">{t("workDone")}</Label>
              <textarea id="workDone" name="workDone" defaultValue={job.workDone ?? ""} maxLength={2000} rows={3} className="w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="odometer">{tNew("odometer")}</Label>
              <Input id="odometer" name="odometer" inputMode="numeric" defaultValue={job.odometerKm ?? ""} autoComplete="off" />
            </div>
          </ActionForm>
        </section>
      ) : null}

      {nextSteps.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t("next")}</h2>
          {nextSteps.includes("ready") ? <p className="text-sm text-muted-foreground">{t("readyNote")}</p> : null}
          {nextSteps.includes("delivered") && job.balance > 0 ? <p className="text-sm text-muted-foreground">{t("creditNote")}</p> : null}
          <div className="grid gap-3">
            {nextSteps.map((status) => (
              <ActionForm key={status} action={setStatusAction} submitLabel={status === "in_progress" && job.status === "ready" ? t("backToRepair") : t(STATUS_LABEL[status]!)} variant={status === "delivered" || status === "ready" ? "default" : "outline"}>
                <input type="hidden" name="job" value={job.id} />
                <input type="hidden" name="status" value={status} />
                {status === "delivered" && job.balance > 0 && canManage ? (
                  <DateField name="due" label={t("due")} defaultValue={addisToday()} />
                ) : (
                  <input type="hidden" name="due" value="" />
                )}
              </ActionForm>
            ))}
            {job.status !== "ready" ? (
              <ActionForm action={setStatusAction} submitLabel={t("cancel")} variant="destructive">
                <input type="hidden" name="job" value={job.id} />
                <input type="hidden" name="status" value="cancelled" />
                <input type="hidden" name="due" value="" />
              </ActionForm>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="text-muted-foreground">{t("closed")}</p>
      )}
    </div>
  );
}
