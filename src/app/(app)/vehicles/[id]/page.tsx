import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusTag } from "@/components/garage/job-row";
import { Plate } from "@/components/garage/plate";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/money";
import { getVehicleHistory } from "@/server/dal/garage";
import { uuidParam } from "@/server/validation";

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const locale = (await getLocale()) as Locale;
  const [history, t, tJob, tJobs] = await Promise.all([
    getVehicleHistory(id, locale),
    getTranslations("vehicle"),
    getTranslations("job"),
    getTranslations("jobs"),
  ]);
  if (!history) notFound();
  const { vehicle, jobs } = history;
  const hasOpen = jobs.some((j) => j.status !== "delivered");
  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <Plate plate={vehicle.plate} className="justify-self-start text-2xl" />
        <p className="font-medium">
          {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ")}
          {vehicle.color ? ` · ${vehicle.color}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {vehicle.ownerName ?? tJobs("noOwner")}
          {vehicle.ownerPhone ? ` · ${vehicle.ownerPhone}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">{t("visits", { count: jobs.length })}</p>
      </header>

      {!hasOpen ? (
        <Link href={`/jobs/new?plate=${encodeURIComponent(vehicle.plate)}`} className={buttonVariants({ size: "lg" })}>
          {tJobs("openForPlate", { plate: vehicle.plate })}
        </Link>
      ) : null}

      {jobs.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="grid gap-3">
          {jobs.map((job) => (
            <li key={job.id} className="grid gap-2 rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="num text-sm text-muted-foreground">
                  {formatEthiopianDate(job.openedAt.slice(0, 10), locale)} · {tJobs("jobNo", { no: job.jobNo })}
                </span>
                <StatusTag status={job.status} />
              </div>
              <Link href={`/jobs/${job.id}`} className="font-semibold underline-offset-4 hover:underline">
                {job.complaint}
              </Link>
              {job.workDone ? <p className="text-sm">{job.workDone}</p> : null}
              {job.lines.parts.length > 0 ? (
                <ul className="grid gap-0.5 text-sm">
                  {job.lines.parts.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="num">× {p.qty}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noParts")}</p>
              )}
              <p className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {job.mechanicName ?? tJobs("noMechanic")}
                  {job.odometerKm != null ? ` · ${t("km", { km: job.odometerKm })}` : ""}
                </span>
                <span className="num font-semibold">
                  {tJob("total")}: {formatBirr(job.total, locale)}
                </span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
