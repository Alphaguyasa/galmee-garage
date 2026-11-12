import { useLocale, useTranslations } from "next-intl";
import { CircleCheck, CircleDashed, Clock3, PackageSearch, Truck, Wrench, XCircle, type LucideIcon } from "lucide-react";
import { ListRow } from "@/components/galmee/list-row";
import { StatusBadge } from "@/components/galmee/status-badge";
import { Plate } from "@/components/garage/plate";
import type { Locale } from "@/i18n/config";
import { formatBirr } from "@/lib/money";
import type { JobDTO } from "@/server/dal/garage";
import type { JobStatus } from "@/server/validation";

const ICONS: Record<JobStatus, LucideIcon> = {
  open: Clock3,
  in_progress: Wrench,
  waiting_parts: PackageSearch,
  ready: CircleCheck,
  delivered: Truck,
  cancelled: XCircle,
};

const TONES: Record<JobStatus, "ok" | "warn" | "sync" | "neutral"> = {
  open: "neutral",
  in_progress: "sync",
  waiting_parts: "warn",
  ready: "neutral",
  delivered: "ok",
  cancelled: "neutral",
};

/** Status is a word and an icon, never colour alone. "Ready" wears plate yellow, the garage's one bold colour. */
export function StatusTag({ status }: { status: JobStatus }) {
  const t = useTranslations("status");
  return (
    <StatusBadge
      tone={TONES[status] ?? "neutral"}
      icon={ICONS[status] ?? CircleDashed}
      className={status === "ready" ? "bg-plate text-foreground" : undefined}
    >
      {t(status)}
    </StatusBadge>
  );
}

/** One job in a ListSheet: the plate first, the complaint, then car, customer and mechanic. */
export function JobRow({ job, showOwes = false }: { job: JobDTO; showOwes?: boolean }) {
  const t = useTranslations("jobs");
  const locale = useLocale() as Locale;
  const vehicleName = [job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ");
  return (
    <ListRow
      href={`/jobs/${job.id}`}
      title={<Plate plate={job.vehicle.plate} />}
      sub={
        <>
          <span className="break-words text-foreground">{job.complaint}</span>
          <span className="break-words">
            {vehicleName ? `${vehicleName} · ` : ""}
            {job.customer.name} · {job.mechanicName ?? t("noMechanic")}
          </span>
        </>
      }
      right={
        <>
          <StatusTag status={job.status} />
          {showOwes && job.balance > 0 ? (
            <span className="num font-semibold text-owed">{formatBirr(job.balance, locale)}</span>
          ) : (
            <span className="num text-sm text-muted-foreground">{t("jobNo", { no: job.jobNo })}</span>
          )}
        </>
      }
    />
  );
}
