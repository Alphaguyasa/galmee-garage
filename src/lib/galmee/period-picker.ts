/**
 * Galmee kit: what the report period picker shows and emits.
 *
 * Pure (no React) so it is tested directly; `components/galmee/period-picker.tsx` renders it.
 * Copy with `eth-calendar.ts` unchanged.
 */

import {
  customPeriod,
  dayPeriod,
  ethMonthDays,
  ethToIso,
  extraPeriod,
  formatEthMonth,
  formatEthRange,
  isoToEth,
  monthPeriod,
  untilToday,
  weekPeriod,
  type EthDate,
  type EthLang,
  type Period,
  type PeriodDef,
} from "./eth-calendar";

/** What the owner picked. `offset` steps back through days, weeks or months (0 = current). */
export type PeriodChoice =
  | { kind: "today" | "week" | "month"; offset?: number }
  | { kind: "custom"; fromDay: string; toDay: string }
  | { kind: "extra"; key: string };

/** What the picker hands to the report: the query range, last year's range and a label. */
export type PickedPeriod = Period & { label: string; title: string };

export type PeriodStrings = {
  today: string;
  week: string;
  month: string;
  custom: string;
  previous: string;
  next: string;
  pickDates: string;
  from: string;
  to: string;
  day: string;
  monthField: string;
  year: string;
  apply: string;
  close: string;
  endsBeforeStart: string;
  lastYear: (label: string) => string;
};

const STRINGS: Record<EthLang, PeriodStrings> = {
  en: {
    today: "Today",
    week: "This week",
    month: "This month",
    custom: "Pick dates",
    previous: "Earlier",
    next: "Later",
    pickDates: "Pick dates",
    from: "From",
    to: "To",
    day: "Day",
    monthField: "Month",
    year: "Year",
    apply: "Show",
    close: "Close",
    endsBeforeStart: "The end date is before the start date.",
    lastYear: (label) => `Last year: ${label}`,
  },
  am: {
    today: "ዛሬ",
    week: "ይህ ሳምንት",
    month: "ይህ ወር",
    custom: "ቀን ምረጥ",
    previous: "ቀደም ያለ",
    next: "ቀጣይ",
    pickDates: "ቀን ምረጥ",
    from: "ከ",
    to: "እስከ",
    day: "ቀን",
    monthField: "ወር",
    year: "ዓመት",
    apply: "አሳይ",
    close: "ዝጋ",
    endsBeforeStart: "የመጨረሻው ቀን ከመጀመሪያው ቀን በፊት ነው።",
    lastYear: (label) => `ያለፈው ዓመት፦ ${label}`,
  },
  om: {
    today: "Har'a",
    week: "Torban kana",
    month: "Ji'a kana",
    custom: "Guyyaa filadhu",
    previous: "Kan duraa",
    next: "Kan itti aanu",
    pickDates: "Guyyaa filadhu",
    from: "Irraa",
    to: "Hanga",
    day: "Guyyaa",
    monthField: "Ji'a",
    year: "Waggaa",
    apply: "Agarsiisi",
    close: "Cufi",
    endsBeforeStart: "Guyyaan xumuraa guyyaa jalqabaa dura jira.",
    lastYear: (label) => `Bara darbe: ${label}`,
  },
};

export function periodStrings(lang: string): PeriodStrings {
  return STRINGS[lang as EthLang] ?? STRINGS.en;
}

const asLang = (lang: string): EthLang => (lang in STRINGS ? (lang as EthLang) : "en");

/** How far back the arrows go: 2 years of days/weeks, 3 years of months. */
export const MAX_BACK = { today: 730, week: 104, month: 39 } as const;

function clampOffset(kind: keyof typeof MAX_BACK, offset = 0) {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(-MAX_BACK[kind], Math.min(0, Math.trunc(offset)));
}

/**
 * The period a choice means on `today`. The current week and month stop at today, and so does
 * their last-year range, so "this month so far" is compared with the same days a year ago.
 */
export function resolveChoice(choice: PeriodChoice, today: string, lang: string, extras: PeriodDef[] = []): PickedPeriod {
  const l = asLang(lang);
  const s = STRINGS[l];
  switch (choice.kind) {
    case "today": {
      const offset = clampOffset("today", choice.offset);
      const p = dayPeriod(today, offset);
      return { ...p, title: offset === 0 ? s.today : formatEthRange(p.fromDay, p.toDay, l), label: formatEthRange(p.fromDay, p.toDay, l) };
    }
    case "week": {
      const offset = clampOffset("week", choice.offset);
      const p = untilToday(weekPeriod(today, offset), today);
      const label = formatEthRange(p.fromDay, p.toDay, l);
      return { ...p, title: offset === 0 ? s.week : label, label };
    }
    case "month": {
      const offset = clampOffset("month", choice.offset);
      const p = untilToday(monthPeriod(today, offset), today);
      const label = formatEthMonth(p.ethYear, p.ethMonth, l);
      return { ...p, title: offset === 0 ? s.month : label, label };
    }
    case "custom": {
      const [a, b] = choice.fromDay <= choice.toDay ? [choice.fromDay, choice.toDay] : [choice.toDay, choice.fromDay];
      const p = customPeriod(a, b);
      const label = formatEthRange(p.fromDay, p.toDay, l);
      return { ...p, title: label, label };
    }
    case "extra": {
      const def = extras.find((d) => d.key === choice.key);
      if (!def) return resolveChoice({ kind: "today" }, today, lang, extras);
      const p = extraPeriod(def, today);
      return { ...p, title: def.label[l], label: formatEthRange(p.fromDay, p.toDay, l) };
    }
  }
}

/** The last-year line under the label. */
export function lastYearLabel(p: Period, lang: string): string {
  const l = asLang(lang);
  return STRINGS[l].lastYear(formatEthRange(p.lastYear.fromDay, p.lastYear.toDay, l));
}

/** Arrow steps for a choice: `null` where there is no arrow (custom and app periods). */
export function stepChoice(choice: PeriodChoice, by: -1 | 1): PeriodChoice | null {
  if (choice.kind !== "today" && choice.kind !== "week" && choice.kind !== "month") return null;
  const offset = clampOffset(choice.kind, (choice.offset ?? 0) + by);
  if (offset === clampOffset(choice.kind, choice.offset)) return null;
  return { kind: choice.kind, offset };
}

// ---- Custom range fields -------------------------------------------------------------------

/** Ethiopian years the custom sheet offers: this year and `back` years before. */
export function yearOptions(today: string, back = 5): number[] {
  const y = isoToEth(today).year;
  return Array.from({ length: back + 1 }, (_, i) => y - i);
}

/** Day numbers for a month (Pagume: 5 or 6). */
export function dayOptions(year: number, month: number): number[] {
  return Array.from({ length: ethMonthDays(year, month) }, (_, i) => i + 1);
}

/** An Ethiopian date from the three fields, with the day clamped to the month (Pagume 6 -> 5). */
export function fieldsToDay(e: EthDate): string {
  return ethToIso({ ...e, day: Math.min(e.day, ethMonthDays(e.year, e.month)) });
}

/** Checks a custom range before it is applied. */
export function validateCustom(fromDay: string, toDay: string): "ok" | "endsBeforeStart" {
  return toDay < fromDay ? "endsBeforeStart" : "ok";
}
