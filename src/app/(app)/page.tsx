import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Search } from "lucide-react";
import { JobRow } from "@/components/garage/job-row";
import { Plate } from "@/components/garage/plate";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { plateKey } from "@/lib/plate";
import { cn } from "@/lib/utils";
import { listOpenJobs, searchVehicles } from "@/server/dal/garage";
import { plateParam } from "@/server/validation";

export default async function PlatePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const parsed = plateParam.safeParse(q ?? "");
  const query = parsed.success ? parsed.data : "";
  const hasQuery = plateKey(query).length >= 2;
  const [t, vehicles, jobs] = await Promise.all([getTranslations("jobs"), hasQuery ? searchVehicles(query) : Promise.resolve([]), listOpenJobs()]);

  return (
    <div className="grid gap-6">
      <form action="/" className="grid gap-2">
        <Label htmlFor="q" className="text-base font-semibold">
          {t("plateLabel")}
        </Label>
        <div className="flex gap-2">
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder={t("platePlaceholder")}
            autoCapitalize="characters"
            autoComplete="off"
            className="num h-14 min-w-0 flex-1 rounded border-2 border-foreground bg-plate px-3 text-2xl font-bold tracking-wide text-foreground outline-none placeholder:text-foreground/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <button type="submit" aria-label={t("search")} className={cn(buttonVariants({ size: "lg" }), "h-14 w-14 shrink-0 px-0")}>
            <Search aria-hidden className="size-6" />
          </button>
        </div>
      </form>

      {hasQuery ? (
        <section className="grid gap-2" aria-live="polite">
          <h2 className="text-lg font-semibold">{t("results")}</h2>
          {vehicles.length === 0 ? (
            <div className="grid gap-3">
              <p>{t("noVehicle", { plate: query.toUpperCase() })}</p>
              <Link href={`/jobs/new?plate=${encodeURIComponent(query)}`} className={buttonVariants({ size: "lg" })}>
                {t("openForPlate", { plate: query.toUpperCase() })}
              </Link>
            </div>
          ) : (
            <ul>
              {vehicles.map((v) => (
                <li key={v.id}>
                  <Link href={`/vehicles/${v.id}`} className="flex items-center justify-between gap-3 border-b py-3 hover:bg-accent/40">
                    <Plate plate={v.plate} />
                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                      {[v.make, v.model].filter(Boolean).join(" ")} {v.ownerName ?? t("noOwner")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="grid gap-1">
        <h2 className="text-lg font-semibold">{t("inYard", { count: jobs.length })}</h2>
        {jobs.length === 0 ? (
          <p className="text-muted-foreground">{t("emptyYard")}</p>
        ) : (
          <ul>
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </section>

      <div className="sticky bottom-20 md:bottom-4">
        <Link href="/jobs/new" className={cn(buttonVariants({ size: "lg" }), "h-12 w-full shadow-md")}>
          <Plus aria-hidden />
          {t("newJob")}
        </Link>
      </div>
    </div>
  );
}
