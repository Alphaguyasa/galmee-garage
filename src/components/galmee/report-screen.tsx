"use client";

import { useEffect, useState } from "react";
import { BookOpen, CloudOff, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PeriodDef } from "@/lib/galmee/eth-calendar";
import { resolveChoice, type PeriodChoice, type PickedPeriod } from "@/lib/galmee/period-picker";
import {
  cellText,
  formatTile,
  pickLang,
  reportStrings,
  tileValue,
  type ReportDef,
  type ReportFetcher,
  type ReportResult,
  type ReportRow,
} from "@/lib/galmee/report";
import { cn } from "@/lib/utils";
import { DataList } from "./data-list";
import { EmptyState } from "./empty-state";
import { PeriodPicker } from "./period-picker";

type Load = { state: "loading" } | { state: "error" } | ({ state: "ready" } & ReportResult);

/**
 * A report screen: period picker, one tab per report, tiles (2-up on phones), then the rows
 * as ruled sheets (a table from 768 px). Tiles are computed here from the fetched rows, so the
 * app's views stay plain. Offline, the last fetched copy shows with a "saved copy" badge.
 */
export function ReportScreen({
  defs,
  lang,
  today,
  fetcher,
  extras,
  initial = { kind: "today" },
  onPeriodChange,
  actions,
}: {
  defs: ReportDef[];
  lang: string;
  today: string;
  fetcher: ReportFetcher;
  extras?: PeriodDef[];
  initial?: PeriodChoice;
  /** e.g. to keep the period in the URL. */
  onPeriodChange?: (choice: PeriodChoice, period: PickedPeriod) => void;
  /** Extra buttons next to Print (Export CSV, 80 mm summary). */
  actions?: (ctx: { def: ReportDef; period: PickedPeriod; rows: ReportRow[] }) => React.ReactNode;
}) {
  const [choice, setChoice] = useState<PeriodChoice>(initial);
  const [defKey, setDefKey] = useState(defs[0]?.key);
  const [loaded, setLoaded] = useState<{ key: string; load: Load } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const def = defs.find((d) => d.key === defKey) ?? defs[0];
  const period = resolveChoice(choice, today, lang, extras);

  // One key per request; until its answer arrives the screen shows "loading".
  const requestKey = `${def?.key}|${period.from}|${period.to}|${attempt}`;
  const load: Load = loaded?.key === requestKey ? loaded.load : { state: "loading" };

  useEffect(() => {
    if (!def) return;
    let live = true;
    fetcher(def, period).then(
      (r) => live && setLoaded({ key: requestKey, load: { state: "ready", ...r } }),
      () => live && setLoaded({ key: requestKey, load: { state: "error" } }),
    );
    return () => {
      live = false;
    };
    // requestKey identifies def + period + attempt; the period object is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, fetcher]);

  if (!def) return null;

  return (
    <section className="space-y-4" data-slot="report-screen">
      <PeriodPicker
        lang={lang}
        today={today}
        value={choice}
        extras={extras}
        onChange={(c, p) => {
          setChoice(c);
          onPeriodChange?.(c, p);
        }}
      />
      {defs.length > 1 ? (
        <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 print:hidden">
          {defs.map((d) => (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={d.key === def.key}
              onClick={() => setDefKey(d.key)}
              className={cn(
                "h-12 shrink-0 border-b-2 px-3 text-sm font-bold",
                d.key === def.key ? "border-primary text-primary" : "border-transparent text-muted-foreground",
              )}
            >
              {pickLang(d.title, lang)}
            </button>
          ))}
        </div>
      ) : null}
      <ReportBody
        def={def}
        lang={lang}
        period={period}
        load={load}
        onRetry={() => setAttempt((n) => n + 1)}
        actions={load.state === "ready" ? actions?.({ def, period, rows: load.rows }) : null}
      />
    </section>
  );
}

/** The part under the picker; exported so it can be rendered and tested without fetching. */
export function ReportBody({
  def,
  lang,
  period,
  load,
  onRetry,
  actions,
}: {
  def: ReportDef;
  lang: string;
  period: PickedPeriod;
  load: Load;
  onRetry?: () => void;
  actions?: React.ReactNode;
}) {
  const s = reportStrings(lang);
  if (load.state === "loading") {
    return (
      <p className="py-8 text-center text-muted-foreground" aria-live="polite">
        {s.loading}
      </p>
    );
  }
  if (load.state === "error") {
    return (
      <EmptyState
        icon={TriangleAlert}
        message={s.failed}
        action={
          onRetry ? (
            <Button variant="outline" onClick={onRetry}>
              {s.retry}
            </Button>
          ) : null
        }
      />
    );
  }

  const rows = load.rows;
  return (
    <div className="space-y-4" data-report={def.key}>
      {load.stale ? (
        <p className="flex items-center gap-2 text-sm font-bold text-warn" data-stale>
          <CloudOff className="size-4" aria-hidden />
          {s.stale}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {def.tiles.map((t) => (
          <div key={t.key} className="rounded-md border bg-card p-3">
            <dt className="text-sm text-muted-foreground">{pickLang(t.label, lang)}</dt>
            <dd className={cn("num mt-1 text-xl font-bold break-words", t.money && "text-money-in")} data-tile={t.key}>
              {formatTile(t, tileValue(t, rows), lang)}
            </dd>
          </div>
        ))}
      </dl>
      {load.tooMany ? (
        <p role="status" className="rounded-md border border-warn p-3 text-sm">
          {s.tooMany}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon={BookOpen} message={s.empty(period.label)} className="bg-[repeating-linear-gradient(var(--card)_0_31px,var(--border)_31px_32px)]" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <span className="text-sm text-muted-foreground">{s.rows(rows.length)}</span>
            <div className="flex flex-wrap gap-2">
              {actions}
              <Button variant="outline" onClick={() => window.print()}>
                <Printer aria-hidden />
                {s.print}
              </Button>
            </div>
          </div>
          <DataList
            caption={`${pickLang(def.title, lang)} · ${period.label}`}
            rows={rows}
            rowKey={(r) => String(r.id ?? JSON.stringify(r))}
            columns={def.columns.map((c) => ({
              key: c.key,
              header: pickLang(c.label, lang),
              num: c.money,
              cell: (r: ReportRow) => cellText(c, r, lang),
            }))}
          />
        </>
      )}
    </div>
  );
}
