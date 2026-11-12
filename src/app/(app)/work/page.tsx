import { getTranslations } from "next-intl/server";
import { Wrench } from "lucide-react";
import { EmptyState } from "@/components/galmee/empty-state";
import { ListSheet } from "@/components/galmee/list-row";
import { JobRow } from "@/components/garage/job-row";
import { SelectField } from "@/components/garage/fields";
import { Button } from "@/components/ui/button";
import { listMechanics, listOpenJobs } from "@/server/dal/garage";
import { uuidParam } from "@/server/validation";

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ mechanic?: string }> }) {
  const { mechanic } = await searchParams;
  const selected = uuidParam.safeParse(mechanic).success ? mechanic : undefined;
  const [t, tJobs, mechanics, jobs] = await Promise.all([getTranslations("work"), getTranslations("jobs"), listMechanics(), listOpenJobs(selected)]);

  // Grouped by mechanic so each person sees their own column of work.
  const groups = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const key = job.mechanicName ?? tJobs("noMechanic");
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
      <form action="/work" className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SelectField
            name="mechanic"
            label={t("filter")}
            defaultValue={selected ?? ""}
            options={[{ value: "", label: t("all") }, ...mechanics.map((m) => ({ value: m.id, label: m.name }))]}
          />
        </div>
        <Button type="submit" size="lg">{t("apply")}</Button>
      </form>
      {jobs.length === 0 ? (
        <EmptyState icon={Wrench} message={t("empty")} />
      ) : (
        [...groups.entries()].map(([name, group]) => (
          <section key={name} className="grid gap-1">
            <h2 className="text-lg font-semibold">{name}</h2>
            <ListSheet>
              {group.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </ListSheet>
          </section>
        ))
      )}
    </div>
  );
}
