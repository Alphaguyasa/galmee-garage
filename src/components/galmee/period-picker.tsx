"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ETH_MONTHS, isoToEth, type EthDate, type EthLang, type PeriodDef } from "@/lib/galmee/eth-calendar";
import {
  dayOptions,
  fieldsToDay,
  lastYearLabel,
  periodStrings,
  resolveChoice,
  stepChoice,
  validateCustom,
  yearOptions,
  type PeriodChoice,
  type PickedPeriod,
} from "@/lib/galmee/period-picker";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";

const SELECT =
  "h-12 w-full rounded-md border border-input bg-card px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Report period picker: Today · This week · This month · app periods · Pick dates.
 * Arrows step back through days, weeks or Ethiopian months; "Pick dates" opens a
 * sheet with Ethiopian day / month / year fields (native selects, so phones show
 * their own wheels). Controlled: the app keeps `value` (in the URL, say) and gets
 * the resolved period with every change.
 */
export function PeriodPicker({
  lang,
  today,
  value,
  onChange,
  extras = [],
  showLastYear = true,
}: {
  lang: string;
  /** Today in Addis Ababa, 'YYYY-MM-DD' (addisDay()). Passed in so server and client agree. */
  today: string;
  value: PeriodChoice;
  onChange: (choice: PeriodChoice, period: PickedPeriod) => void;
  extras?: PeriodDef[];
  showLastYear?: boolean;
}) {
  const s = periodStrings(lang);
  const period = resolveChoice(value, today, lang, extras);
  const [sheet, setSheet] = useState(false);
  const pick = (choice: PeriodChoice) => onChange(choice, resolveChoice(choice, today, lang, extras));
  const back = stepChoice(value, -1);
  const forward = stepChoice(value, 1);

  const tabs: { id: string; label: string; choice: PeriodChoice }[] = [
    { id: "today", label: s.today, choice: { kind: "today" } },
    { id: "week", label: s.week, choice: { kind: "week" } },
    { id: "month", label: s.month, choice: { kind: "month" } },
    ...extras.map((d) => ({ id: `extra:${d.key}`, label: d.label[lang as EthLang] ?? d.label.en, choice: { kind: "extra", key: d.key } as PeriodChoice })),
  ];
  const activeId = value.kind === "extra" ? `extra:${value.key}` : value.kind;

  return (
    <div data-slot="period-picker" className="space-y-2">
      <div role="group" aria-label={s.pickDates} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={activeId === t.id}
            onClick={() => pick(t.choice)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-4 text-sm font-bold",
              activeId === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-band",
            )}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={value.kind === "custom"}
          onClick={() => setSheet(true)}
          className={cn(
            "h-10 shrink-0 rounded-full border px-4 text-sm font-bold",
            value.kind === "custom" ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-band",
          )}
        >
          {s.custom}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {back || forward ? (
          <Button variant="outline" size="icon" aria-label={s.previous} disabled={!back} onClick={() => back && pick(back)}>
            <ChevronLeft aria-hidden />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1 text-center" aria-live="polite">
          <p className="truncate font-bold" data-period-title>
            {period.title}
          </p>
          {period.title !== period.label ? <p className="truncate text-sm text-muted-foreground">{period.label}</p> : null}
          {showLastYear ? <p className="truncate text-xs text-muted-foreground">{lastYearLabel(period, lang)}</p> : null}
        </div>
        {back || forward ? (
          <Button variant="outline" size="icon" aria-label={s.next} disabled={!forward} onClick={() => forward && pick(forward)}>
            <ChevronRight aria-hidden />
          </Button>
        ) : null}
      </div>

      <CustomRangeSheet
        key={sheet ? "open" : "closed"}
        open={sheet}
        onClose={() => setSheet(false)}
        lang={lang}
        today={today}
        initial={value.kind === "custom" ? { fromDay: value.fromDay, toDay: value.toDay } : { fromDay: period.fromDay, toDay: period.toDay }}
        onApply={(fromDay, toDay) => {
          setSheet(false);
          pick({ kind: "custom", fromDay, toDay });
        }}
      />
    </div>
  );
}

/** The "Pick dates" sheet: two Ethiopian dates. Exported for apps that need a range alone. */
export function CustomRangeSheet({
  open,
  onClose,
  lang,
  today,
  initial,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  lang: string;
  today: string;
  initial: { fromDay: string; toDay: string };
  onApply: (fromDay: string, toDay: string) => void;
}) {
  const s = periodStrings(lang);
  const [from, setFrom] = useState<EthDate>(() => isoToEth(initial.fromDay));
  const [to, setTo] = useState<EthDate>(() => isoToEth(initial.toDay));
  const fromDay = fieldsToDay(from);
  const toDay = fieldsToDay(to);
  const check = validateCustom(fromDay, toDay);

  return (
    <Sheet open={open} onClose={onClose} title={s.pickDates} closeLabel={s.close}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (check === "ok") onApply(fromDay, toDay);
        }}
      >
        <EthDateFields legend={s.from} lang={lang} today={today} value={from} onChange={setFrom} />
        <EthDateFields legend={s.to} lang={lang} today={today} value={to} onChange={setTo} />
        {check !== "ok" ? (
          <p role="alert" className="text-sm font-bold text-urgent">
            {s.endsBeforeStart}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={check !== "ok"}>
          {s.apply}
        </Button>
      </form>
    </Sheet>
  );
}

export function EthDateFields({
  legend,
  lang,
  today,
  value,
  onChange,
}: {
  legend: string;
  lang: string;
  today: string;
  value: EthDate;
  onChange: (value: EthDate) => void;
}) {
  const s = periodStrings(lang);
  const months = ETH_MONTHS[lang as EthLang] ?? ETH_MONTHS.en;
  const years = yearOptions(today);
  if (!years.includes(value.year)) years.push(value.year);
  const days = dayOptions(value.year, value.month);
  const set = (patch: Partial<EthDate>) => {
    const next = { ...value, ...patch };
    onChange({ ...next, day: Math.min(next.day, dayOptions(next.year, next.month).length) });
  };

  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-sm font-bold">{legend}</legend>
      <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2">
        <select aria-label={`${legend} ${s.day}`} className={SELECT} value={value.day} onChange={(e) => set({ day: +e.target.value })}>
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select aria-label={`${legend} ${s.monthField}`} className={SELECT} value={value.month} onChange={(e) => set({ month: +e.target.value })}>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label={`${legend} ${s.year}`} className={SELECT} value={value.year} onChange={(e) => set({ year: +e.target.value })}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
