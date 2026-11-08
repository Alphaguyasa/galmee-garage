import { getLocale, getTranslations } from "next-intl/server";
import { JobRow } from "@/components/garage/job-row";
import type { Locale } from "@/i18n/config";
import { formatBirr } from "@/lib/money";
import { listUnpaidJobs } from "@/server/dal/garage";

export default async function UnpaidPage() {
  const locale = (await getLocale()) as Locale;
  const [t, jobs] = await Promise.all([getTranslations("unpaid"), listUnpaidJobs()]);
  const totalOwed = jobs.reduce((sum, j) => sum + Number(j.balance), 0);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {jobs.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <p className="flex items-baseline justify-between gap-3 rounded-md border bg-card p-4">
            <span className="font-semibold">{t("totalOwed")}</span>
            <span className="num text-xl font-bold text-destructive">{formatBirr(totalOwed, locale)}</span>
          </p>
          <ul>
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} showOwes />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
