import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { DataList } from "@/components/galmee/data-list";
import { ListRow, ListSheet } from "@/components/galmee/list-row";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/money";
import { REPORT_RANGES, addisToday, parseReportRange, reportRangeDates, type ReportRange } from "@/lib/report-range";
import { cn } from "@/lib/utils";
import { dailyReport, labourByMechanic } from "@/server/dal/garage";
import { getSession } from "@/server/dal/session";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = parseReportRange((await searchParams).range);
  const { profile } = await getSession();
  if (profile.role === "staff") redirect("/");
  const { from, to } = reportRangeDates(range, addisToday());
  const [days, mechanics, t, locale] = await Promise.all([
    dailyReport(from, to),
    labourByMechanic(from, to),
    getTranslations("reports"),
    getLocale() as Promise<Locale>,
  ]);
  const rows = [...days].reverse();
  const parts = days.reduce((sum, d) => sum + d.parts, 0);
  const labour = days.reduce((sum, d) => sum + d.labour, 0);
  const collected = days.reduce((sum, d) => sum + d.collected, 0);
  const work = parts + labour;
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-4">
      <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
      <nav className="flex flex-wrap gap-2" aria-label={t("range")}>
        {REPORT_RANGES.map((r) => (
          <Link
            key={r}
            href={`/reports?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={cn(buttonVariants({ variant: r === range ? "default" : "outline" }), r !== range && "bg-card")}
          >
            {rangeLabel(r, t)}
          </Link>
        ))}
        <a href={`/reports/export?range=${range}`} className={cn(buttonVariants({ variant: "outline" }), "bg-card")}>
          <Download aria-hidden />
          {t("export")}
        </a>
      </nav>
      <p className="text-sm text-muted-foreground">
        {from === to
          ? formatEthiopianDate(from, locale)
          : t("period", { from: formatEthiopianDate(from, locale, { withEra: false }), to: formatEthiopianDate(to, locale) })}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <MoneySummaryCard label={t("collected")} figure={formatBirr(collected, locale)} tone="in" />
        <MoneySummaryCard
          label={t("work")}
          figure={formatBirr(work, locale)}
          sub={t("workSub", { labour: formatBirr(labour, locale), parts: formatBirr(parts, locale) })}
          size="md"
        />
      </div>
      {work > 0 ? <p className="text-sm">{t("labourShare", { pct: Math.round((labour / work) * 100) })}</p> : null}
      {mechanics.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-semibold">{t("byMechanic")}</h2>
          <ListSheet>
            {mechanics.map((m) => (
              <ListRow
                key={m.mechanicId ?? "none"}
                title={m.name ?? t("noMechanic")}
                sub={t("mechanicJobs", { count: m.jobs })}
                right={<span className="num font-semibold">{formatBirr(m.labour, locale)}</span>}
              />
            ))}
          </ListSheet>
        </section>
      ) : null}
      <DataList
        caption={t("title")}
        rows={rows}
        rowKey={(d) => d.day}
        columns={[
          { key: "date", header: t("date"), cell: (d) => formatEthiopianDate(d.day, locale, { withEra: false }) },
          { key: "jobs", header: t("jobs"), num: true, cell: (d) => d.jobsDelivered },
          { key: "labour", header: t("labour"), num: true, cell: (d) => formatBirr(d.labour, locale) },
          { key: "parts", header: t("parts"), num: true, cell: (d) => formatBirr(d.parts, locale) },
          { key: "collected", header: t("collectedColumn"), num: true, cell: (d) => formatBirr(d.collected, locale) },
        ]}
      />
    </div>
  );
}

function rangeLabel(range: ReportRange, t: (key: string, values?: Record<string, number>) => string) {
  if (range === "today") return t("today");
  if (range === "week") return t("thisWeek");
  if (range === "month") return t("thisMonth");
  return t("lastDays", { days: Number(range) });
}
