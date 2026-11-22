import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { GalmeeMark } from "@/components/galmee/brand";
import { StatusTag } from "@/components/garage/job-row";
import { Plate } from "@/components/garage/plate";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/money";
import { customerSteps, isStatusToken, showAmountDue } from "@/lib/status-link";
import { cn } from "@/lib/utils";
import { getPublicJobStatus } from "@/server/dal/status-link";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("statusPage");
  // The link is private to the customer: keep it out of search engines and other sites' logs.
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

const day = (iso: string) => iso.slice(0, 10);

/** Read-only page the garage shares with the customer: where the car is, and what is due once it is ready. */
export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isStatusToken(token)) notFound();
  const [job, t, locale] = await Promise.all([
    getPublicJobStatus(token),
    getTranslations("statusPage"),
    getLocale() as Promise<Locale>,
  ]);
  if (!job) notFound();
  const steps = customerSteps(job.status);

  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-start gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <GalmeeMark className="size-10 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{job.garageName}</p>
          <p className="text-sm text-muted-foreground">{t("title")}</p>
        </div>
      </header>

      <section className="grid gap-2 rounded-md border bg-card p-4" aria-labelledby="car">
        <h1 id="car" className="sr-only">{t("car", { plate: job.plate })}</h1>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Plate plate={job.plate} className="text-xl" />
          <StatusTag status={job.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {t("jobNo", { no: job.jobNo })}
          {job.vehicleLabel ? ` · ${job.vehicleLabel}` : ""}
          {" · "}
          {t("broughtIn", { date: formatEthiopianDate(day(job.openedAt), locale) })}
        </p>
      </section>

      {steps ? (
        <ol className="grid gap-0" aria-label={t("progress")}>
          {steps.map((step, i) => (
            <li key={step.key} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                    step.state === "done" && "border-foreground bg-foreground text-background",
                    step.state === "current" && "border-foreground bg-plate text-foreground",
                    step.state === "todo" && "border-border text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {step.state === "done" ? <Check className="size-4" /> : <span className="num text-sm font-bold">{i + 1}</span>}
                </span>
                {i < steps.length - 1 ? <span className="w-0.5 flex-1 bg-border" aria-hidden /> : null}
              </span>
              <span className={cn("pb-5 pt-1", step.state === "todo" && "text-muted-foreground")}>
                <span className={cn("block", step.state === "current" ? "font-bold" : "font-medium")}>{t(`steps.${step.key}`)}</span>
                {step.state === "current" ? <span className="block text-sm text-muted-foreground">{t(`notes.${step.key}`)}</span> : null}
                {step.key === "ready" && job.readyAt ? (
                  <span className="block text-sm text-muted-foreground">{formatEthiopianDate(day(job.readyAt), locale)}</span>
                ) : null}
                {step.key === "delivered" && job.deliveredAt ? (
                  <span className="block text-sm text-muted-foreground">{formatEthiopianDate(day(job.deliveredAt), locale)}</span>
                ) : null}
                <span className="sr-only"> ({t(`state.${step.state}`)})</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-md border bg-card p-4">{t("cancelled")}</p>
      )}

      {showAmountDue(job.status, job.balance) ? (
        <section className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-card p-4" aria-label={t("amountDue")}>
          <span className="text-muted-foreground">{t("total")}</span>
          <span className="num text-right">{formatBirr(job.total, locale)}</span>
          <span className="font-semibold">{t("amountDue")}</span>
          <span className="num text-right text-lg font-bold">{formatBirr(job.balance, locale)}</span>
        </section>
      ) : null}

      {job.garagePhone ? (
        <a href={`tel:${job.garagePhone}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Phone aria-hidden />
          {t("call", { phone: job.garagePhone })}
        </a>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">{t("footer")}</p>
    </main>
  );
}
