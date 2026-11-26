"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PickedPeriod } from "@/lib/galmee/period-picker";
import { reportStrings, type ReportDef, type ReportRow } from "@/lib/galmee/report";
import { csvFilename, downloadCsv, reportCsv } from "@/lib/galmee/report-csv";

/**
 * "Export CSV" for a report, from the rows already on screen (no second fetch).
 * Pass it as ReportScreen's `actions`:
 * `actions={(ctx) => <ExportCsvButton {...ctx} lang={lang} filenameBase="galmee-pharmacy" />}`.
 */
export function ExportCsvButton({
  def,
  period,
  rows,
  lang,
  filenameBase,
}: {
  def: ReportDef;
  period: PickedPeriod;
  rows: ReportRow[];
  lang: string;
  filenameBase: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(reportCsv(rows, def.columns, lang), csvFilename(`${filenameBase}-${def.key}`, period))}
    >
      <Download aria-hidden />
      {reportStrings(lang).exportCsv}
    </Button>
  );
}
