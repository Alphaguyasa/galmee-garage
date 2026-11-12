import { ethiopianToJdn, gregorianToJdn, jdnToGregorian, parseGregorian, toEthiopian } from "@/lib/ethiopian-date";

export const REPORT_RANGES = ["today", "week", "month", "7", "14", "30"] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];
export const DEFAULT_REPORT_RANGE: ReportRange = "14";

export function parseReportRange(value: string | null | undefined): ReportRange {
  return REPORT_RANGES.find((r) => r === value) ?? DEFAULT_REPORT_RANGE;
}

function isoFromJdn(jdn: number): string {
  const { year, month, day } = jdnToGregorian(jdn);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * First and last day (Gregorian ISO, inclusive) of a report range ending today.
 * The week starts on Monday; the month is the current Ethiopian month.
 */
export function reportRangeDates(range: ReportRange, today: string): { from: string; to: string } {
  const todayJdn = gregorianToJdn(parseGregorian(today));
  let fromJdn: number;
  switch (range) {
    case "today":
      fromJdn = todayJdn;
      break;
    case "week":
      // JDN % 7 is 0 on Monday.
      fromJdn = todayJdn - (((todayJdn % 7) + 7) % 7);
      break;
    case "month": {
      const { year, month } = toEthiopian(parseGregorian(today));
      fromJdn = ethiopianToJdn({ year, month, day: 1 });
      break;
    }
    default:
      fromJdn = todayJdn - (Number(range) - 1);
  }
  return { from: isoFromJdn(fromJdn), to: today };
}

/** Today's date (Gregorian ISO) in Addis Ababa, UTC+3 with no daylight saving. */
export function addisToday(now: number = Date.now()): string {
  return new Date(now + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
