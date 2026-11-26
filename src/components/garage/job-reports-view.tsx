"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ExportCsvButton } from "@/components/galmee/export-csv-button";
import { ReportScreen } from "@/components/galmee/report-screen";
import { createReportFetcher } from "@/lib/galmee/report";
import { closedJobRow, GARAGE_REPORTS, jobPaymentRow, runnerClient, SOURCES, type SourceRunner } from "@/lib/garage-reports";
import { createClient } from "@/lib/supabase/client";

const fail = (message: string) => ({ data: null, error: { message } });

/**
 * Jobs closed and money taken on jobs over the Galmee period picker. Rows come straight from
 * Supabase with the user's session (RLS keeps them to this garage); offline, the last loaded
 * copy shows with a "saved copy" badge.
 */
export function JobReportsView({ lang, today }: { lang: string; today: string }) {
  const tj = useTranslations("job");
  const fetcher = useMemo(() => {
    const supabase = createClient();
    const runners: Record<string, SourceRunner> = {
      [SOURCES.closed]: async (range, limit) => {
        if (!range) return fail("range_required");
        const { data, error } = await supabase
          .from("gr_job_cards")
          .select("id, job_no, delivered_at, parts_total, labour_total, total, balance, gr_vehicles(plate), customers(name), gr_mechanics(name)")
          .eq("status", "delivered")
          .gte("delivered_at", range.from)
          .lt("delivered_at", range.to)
          .order("delivered_at")
          .limit(limit);
        return error ? fail(error.message) : { data: data.map((r) => closedJobRow({ ...r, delivered_at: r.delivered_at ?? "" })), error: null };
      },
      [SOURCES.payments]: async (range, limit) => {
        if (!range) return fail("range_required");
        const { data, error } = await supabase
          .from("gr_job_payments")
          .select("id, created_at, amount, method, gr_job_cards(job_no, gr_vehicles(plate))")
          .gte("created_at", range.from)
          .lt("created_at", range.to)
          .order("created_at")
          .limit(limit);
        return error
          ? fail(error.message)
          : { data: data.map((r) => jobPaymentRow(r, (m) => (tj.has(`methods.${m}`) ? tj(`methods.${m}`) : m))), error: null };
      },
    };
    return createReportFetcher(runnerClient(runners));
  }, [tj]);

  return (
    <ReportScreen
      defs={GARAGE_REPORTS}
      lang={lang}
      today={today}
      fetcher={fetcher}
      actions={({ def, period, rows }) => <ExportCsvButton def={def} period={period} rows={rows} lang={lang} filenameBase="galmee-garage" />}
    />
  );
}
