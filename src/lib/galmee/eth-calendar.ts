/**
 * Galmee kit: Ethiopian calendar periods for reports.
 *
 * Self-contained (no app imports), so every Galmee app copies this file unchanged.
 * The database stores Gregorian timestamps; owners think in Ethiopian days, weeks and months.
 * Everything here turns an Ethiopian period into the Gregorian range a query needs, once.
 *
 * Time zone: Africa/Addis_Ababa is UTC+3 all year (no DST), so a day starts at 21:00 UTC
 * the evening before. Ranges are half-open: `from <= t < to`.
 *
 * Weeks start on Monday (the working assumption across Galmee).
 */

export type EthLang = "en" | "am" | "om";
export type EthDate = { year: number; month: number; day: number };

/** A resolved report period. */
export type Period = {
  /** "today" | "week" | "month" | "custom", or the key of an app-supplied period. */
  kind: string;
  /** First and last Gregorian day covered (Addis Ababa), 'YYYY-MM-DD', inclusive. */
  fromDay: string;
  toDay: string;
  /** The same range as UTC timestamps for queries: `from <= t < to`. */
  from: string;
  to: string;
  /** The same period one year earlier, for comparison. */
  lastYear: { fromDay: string; toDay: string; from: string; to: string };
};

/** An extra period an app supplies (school term, coffee season). */
export type PeriodDef = {
  key: string;
  label: Record<EthLang, string>;
  /** First and last Gregorian day of the period that holds `today` ('YYYY-MM-DD'). */
  resolve: (today: string) => { fromDay: string; toDay: string };
};

export const ETH_MONTHS: Record<EthLang, readonly string[]> = {
  am: ["መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"],
  om: ["Fulbaana", "Onkoloolessa", "Sadaasa", "Mudde", "Amajjii", "Guraandhala", "Bitootessa", "Ebla", "Caamsaa", "Waxabajjii", "Adoolessa", "Hagayya", "Qaammee"],
  en: ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"],
};

const ERA: Record<EthLang, string> = { am: "ዓ.ም.", om: "ALI", en: "E.C." };

const ETHIOPIC_OFFSET = 1723856;
const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;

const div = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;
const pad = (n: number) => String(n).padStart(2, "0");

// ---- Day numbers -------------------------------------------------------------------------

/** Julian Day Number of a Gregorian 'YYYY-MM-DD'. */
export function isoToJdn(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Not a day: ${iso}`);
  const year = +m[1];
  const month = +m[2];
  const day = +m[3];
  const a = div(14 - month, 12);
  const y = year + 4800 - a;
  const mm = month + 12 * a - 3;
  const jdn = day + div(153 * mm + 2, 5) + 365 * y + div(y, 4) - div(y, 100) + div(y, 400) - 32045;
  if (jdnToIso(jdn) !== iso) throw new RangeError(`Not a day: ${iso}`);
  return jdn;
}

export function jdnToIso(jdn: number): string {
  const a = jdn + 32044;
  const b = div(4 * a + 3, 146097);
  const c = a - div(146097 * b, 4);
  const d = div(4 * c + 3, 1461);
  const e = c - div(1461 * d, 4);
  const m = div(5 * e + 2, 153);
  const day = e - div(153 * m + 2, 5) + 1;
  const month = m + 3 - 12 * div(m, 10);
  const year = 100 * b + d - 4800 + div(m, 10);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isEthLeapYear(year: number): boolean {
  return mod(year, 4) === 3;
}

/** Days in an Ethiopian month (13 = Pagume: 5, or 6 in a leap year). */
export function ethMonthDays(year: number, month: number): number {
  if (month < 1 || month > 13) throw new RangeError(`Not an Ethiopian month: ${month}`);
  return month < 13 ? 30 : isEthLeapYear(year) ? 6 : 5;
}

export function isoToEth(iso: string): EthDate {
  const jdn = isoToJdn(iso);
  const r = mod(jdn - ETHIOPIC_OFFSET, 1461);
  const n = mod(r, 365) + 365 * div(r, 1460);
  return {
    year: 4 * div(jdn - ETHIOPIC_OFFSET, 1461) + div(r, 365) - div(r, 1460),
    month: div(n, 30) + 1,
    day: mod(n, 30) + 1,
  };
}

export function ethToIso({ year, month, day }: EthDate): string {
  if (!Number.isInteger(day) || day < 1 || day > ethMonthDays(year, month)) {
    throw new RangeError(`Not an Ethiopian day: ${year}-${month}-${day}`);
  }
  return jdnToIso(ETHIOPIC_OFFSET + 365 + 365 * (year - 1) + div(year, 4) + 30 * month + day - 31);
}

/** 'YYYY-MM-DD' moved by `days`. */
export function shiftDay(iso: string, days: number): string {
  return jdnToIso(isoToJdn(iso) + days);
}

/** Today in Addis Ababa, 'YYYY-MM-DD'. */
export function addisDay(now: Date = new Date()): string {
  const t = new Date(now.getTime() + ADDIS_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The UTC instant an Addis Ababa day starts, as an ISO timestamp. */
export function dayStartUtc(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  isoToJdn(iso);
  return new Date(Date.UTC(y, m - 1, d) - ADDIS_OFFSET_MS).toISOString();
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayIndex(iso: string): number {
  return mod(isoToJdn(iso), 7);
}

// ---- Periods -----------------------------------------------------------------------------

/** The same Ethiopian day one year earlier; Pagume 6 clamps to Pagume 5 in a common year. */
export function ethYearBack(iso: string, years = 1): string {
  const e = isoToEth(iso);
  const year = e.year - years;
  return ethToIso({ year, month: e.month, day: Math.min(e.day, ethMonthDays(year, e.month)) });
}

function build(kind: string, fromDay: string, toDay: string, lastFrom: string, lastTo: string): Period {
  if (toDay < fromDay) throw new RangeError("Period ends before it starts");
  return {
    kind,
    fromDay,
    toDay,
    from: dayStartUtc(fromDay),
    to: dayStartUtc(shiftDay(toDay, 1)),
    lastYear: { fromDay: lastFrom, toDay: lastTo, from: dayStartUtc(lastFrom), to: dayStartUtc(shiftDay(lastTo, 1)) },
  };
}

/** One day (default today). Last year: the same Ethiopian date. */
export function dayPeriod(today: string, offset = 0): Period {
  const day = shiftDay(today, offset);
  const last = ethYearBack(day);
  return build("today", day, day, last, last);
}

/**
 * The Monday-to-Sunday week holding `today`, moved by `offset` weeks.
 * Last year: 52 weeks back, so the weekdays line up (Monday against Monday).
 */
export function weekPeriod(today: string, offset = 0): Period {
  const monday = shiftDay(today, -weekdayIndex(today) + 7 * offset);
  const sunday = shiftDay(monday, 6);
  return build("week", monday, sunday, shiftDay(monday, -364), shiftDay(sunday, -364));
}

/** The Ethiopian month holding `today`, moved by `offset` months (Pagume counts as a month). */
export function monthPeriod(today: string, offset = 0): Period & { ethYear: number; ethMonth: number } {
  const e = isoToEth(today);
  const index = e.year * 13 + (e.month - 1) + offset;
  const year = div(index, 13);
  const month = mod(index, 13) + 1;
  const from = ethToIso({ year, month, day: 1 });
  const to = ethToIso({ year, month, day: ethMonthDays(year, month) });
  const lastFrom = ethToIso({ year: year - 1, month, day: 1 });
  const lastTo = ethToIso({ year: year - 1, month, day: ethMonthDays(year - 1, month) });
  return { ...build("month", from, to, lastFrom, lastTo), ethYear: year, ethMonth: month };
}

/** Any range of whole days. Last year: each end moved back one Ethiopian year. */
export function customPeriod(fromDay: string, toDay: string, kind = "custom"): Period {
  return build(kind, fromDay, toDay, ethYearBack(fromDay), ethYearBack(toDay));
}

/** An app-supplied period (term, season) holding `today`. */
export function extraPeriod(def: PeriodDef, today: string): Period {
  const r = def.resolve(today);
  return customPeriod(r.fromDay, r.toDay, def.key);
}

/** A period cut so it does not run past `today` (this month so far, this week so far). */
export function untilToday<P extends Period>(p: P, today: string): P {
  if (p.toDay <= today) return p;
  if (p.fromDay > today) return p;
  const kept = isoToJdn(today) - isoToJdn(p.fromDay);
  const lastTo = shiftDay(p.lastYear.fromDay, kept);
  return { ...p, ...build(p.kind, p.fromDay, today, p.lastYear.fromDay, lastTo) };
}

// ---- Labels ------------------------------------------------------------------------------

export function formatEthDay(iso: string, lang: EthLang, withEra = true): string {
  const e = isoToEth(iso);
  const text = `${ETH_MONTHS[lang][e.month - 1]} ${e.day}, ${e.year}`;
  return withEra ? `${text} ${ERA[lang]}` : text;
}

/** "Hidar 2019 E.C." */
export function formatEthMonth(year: number, month: number, lang: EthLang): string {
  return `${ETH_MONTHS[lang][month - 1]} ${year} ${ERA[lang]}`;
}

/** The dates a period covers, in Ethiopian: "Hidar 14, 2019 E.C." or "Hidar 8 – 14, 2019 E.C.". */
export function formatEthRange(fromDay: string, toDay: string, lang: EthLang): string {
  if (fromDay === toDay) return formatEthDay(fromDay, lang);
  const a = isoToEth(fromDay);
  const b = isoToEth(toDay);
  const m = ETH_MONTHS[lang];
  if (a.year === b.year && a.month === b.month) return `${m[a.month - 1]} ${a.day} – ${b.day}, ${b.year} ${ERA[lang]}`;
  if (a.year === b.year) return `${m[a.month - 1]} ${a.day} – ${m[b.month - 1]} ${b.day}, ${b.year} ${ERA[lang]}`;
  return `${m[a.month - 1]} ${a.day}, ${a.year} – ${m[b.month - 1]} ${b.day}, ${b.year} ${ERA[lang]}`;
}
