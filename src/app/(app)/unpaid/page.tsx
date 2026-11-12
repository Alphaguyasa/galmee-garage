import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { HandCoins } from "lucide-react";
import { EmptyState } from "@/components/galmee/empty-state";
import { ListSheet } from "@/components/galmee/list-row";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
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
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
        <Link href="/customers" className="font-medium text-primary underline underline-offset-4">{t("customers")}</Link>
      </div>
      {jobs.length === 0 ? (
        <EmptyState icon={HandCoins} message={t("empty")} />
      ) : (
        <>
          <MoneySummaryCard tone="owed" label={t("totalOwed")} figure={formatBirr(totalOwed, locale)} />
          <ListSheet>
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} showOwes />
            ))}
          </ListSheet>
        </>
      )}
    </div>
  );
}
