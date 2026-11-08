import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheck, CircleDashed, Clock3, PackageSearch, Truck, Wrench, XCircle, type LucideIcon } from "lucide-react";
import { Plate } from "@/components/garage/plate";
import type { Locale } from "@/i18n/config";
import { formatBirr } from "@/lib/money";
import type { JobDTO } from "@/server/dal/garage";
import type { JobStatus } from "@/server/validation";
import { cn } from "@/lib/utils";

const ICONS: Record<JobStatus, LucideIcon> = {
  open: Clock3,
  in_progress: Wrench,
  waiting_parts: PackageSearch,
  ready: CircleCheck,
  delivered: Truck,
  cancelled: XCircle,
};

/** Status is a word and an icon, never colour alone. */
export function StatusTag({ status }: { status: JobStatus }) {
  const t = useTranslations("status");
  const Icon = ICONS[status] ?? CircleDashed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm font-semibold",
        status === "ready" ? "bg-plate text-foreground" : "bg-muted text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {t(status)}
    </span>
  );
}

export function JobRow({ job, showOwes = false }: { job: JobDTO; showOwes?: boolean }) {
  const t = useTranslations("jobs");
  const locale = useLocale() as Locale;
  const vehicleName = [job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ");
  return (
    <li>
      <Link href={`/jobs/${job.id}`} className="grid gap-1 border-b py-3 hover:bg-accent/40 focus-visible:bg-accent/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Plate plate={job.vehicle.plate} />
          <StatusTag status={job.status} />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-medium">{job.complaint}</p>
          <span className="num shrink-0 text-sm text-muted-foreground">{t("jobNo", { no: job.jobNo })}</span>
        </div>
        <p className="flex flex-wrap justify-between gap-x-3 text-sm text-muted-foreground">
          <span>
            {vehicleName ? `${vehicleName} · ` : ""}
            {job.customer.name}
          </span>
          <span>{job.mechanicName ?? t("noMechanic")}</span>
        </p>
        {showOwes && job.balance > 0 ? (
          <p className="num text-right font-semibold text-destructive">{t("owes", { amount: formatBirr(job.balance, locale) })}</p>
        ) : null}
      </Link>
    </li>
  );
}
