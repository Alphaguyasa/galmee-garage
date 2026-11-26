import { describe, expect, it } from "vitest";
import {
  addisDay,
  customPeriod,
  dayPeriod,
  dayStartUtc,
  ethMonthDays,
  ethToIso,
  ethYearBack,
  extraPeriod,
  formatEthDay,
  formatEthMonth,
  formatEthRange,
  isoToEth,
  monthPeriod,
  shiftDay,
  untilToday,
  weekdayIndex,
  weekPeriod,
  type PeriodDef,
} from "./eth-calendar";

describe("conversion against known dates", () => {
  const known: [string, number, number, number][] = [
    ["2025-09-11", 2018, 1, 1], // Enkutatash 2018
    ["2026-09-11", 2019, 1, 1], // Enkutatash 2019
    ["2027-09-12", 2020, 1, 1], // after the leap Pagume of 2019
    ["2026-01-07", 2018, 4, 29], // Genna
    ["2026-01-19", 2018, 5, 11], // Timkat
    ["2026-09-06", 2018, 13, 1], // Pagume 1, common year
    ["2026-09-10", 2018, 13, 5], // last day of a common year
    ["2027-09-11", 2019, 13, 6], // Pagume 6, leap year
    ["2026-11-23", 2019, 3, 14],
    ["2024-02-29", 2016, 6, 21], // Gregorian leap day
  ];
  it.each(known)("%s is %i-%i-%i", (iso, year, month, day) => {
    expect(isoToEth(iso)).toEqual({ year, month, day });
    expect(ethToIso({ year, month, day })).toBe(iso);
  });

  it("round-trips every day of ten years", () => {
    let iso = "2020-01-01";
    for (let i = 0; i < 3653; i++) {
      expect(ethToIso(isoToEth(iso))).toBe(iso);
      iso = shiftDay(iso, 1);
    }
  });

  it("refuses days that do not exist", () => {
    expect(() => ethToIso({ year: 2018, month: 13, day: 6 })).toThrow(RangeError);
    expect(() => ethToIso({ year: 2018, month: 2, day: 31 })).toThrow(RangeError);
    expect(() => isoToEth("2026-02-29")).toThrow(RangeError);
    expect(ethMonthDays(2019, 13)).toBe(6);
    expect(ethMonthDays(2018, 13)).toBe(5);
  });
});

describe("Addis Ababa day boundaries", () => {
  it("a day starts at 21:00 UTC the evening before", () => {
    expect(dayStartUtc("2026-11-23")).toBe("2026-11-22T21:00:00.000Z");
    expect(dayStartUtc("2026-01-01")).toBe("2025-12-31T21:00:00.000Z");
  });
  it("reads today in Addis, not in UTC", () => {
    expect(addisDay(new Date("2026-11-22T20:59:59Z"))).toBe("2026-11-22");
    expect(addisDay(new Date("2026-11-22T21:00:00Z"))).toBe("2026-11-23");
  });
  it("weeks start on Monday", () => {
    expect(weekdayIndex("2026-11-23")).toBe(0);
    expect(weekdayIndex("2026-11-29")).toBe(6);
  });
});

describe("periods", () => {
  it("today", () => {
    const p = dayPeriod("2026-11-23");
    expect(p).toMatchObject({ kind: "today", fromDay: "2026-11-23", toDay: "2026-11-23" });
    expect(p.from).toBe("2026-11-22T21:00:00.000Z");
    expect(p.to).toBe("2026-11-23T21:00:00.000Z");
    expect(p.lastYear).toMatchObject({ fromDay: "2025-11-23", toDay: "2025-11-23" });
    expect(dayPeriod("2026-11-23", -1).fromDay).toBe("2026-11-22");
  });

  it("this week, Monday to Sunday, last year weekday-aligned", () => {
    for (const day of ["2026-11-23", "2026-11-26", "2026-11-29"]) {
      const p = weekPeriod(day);
      expect([p.fromDay, p.toDay]).toEqual(["2026-11-23", "2026-11-29"]);
      expect([p.lastYear.fromDay, p.lastYear.toDay]).toEqual(["2025-11-24", "2025-11-30"]);
      expect(weekdayIndex(p.lastYear.fromDay)).toBe(0);
    }
    expect(weekPeriod("2026-11-23", -1).fromDay).toBe("2026-11-16");
  });

  it("Meskerem 2018 boundaries are exact", () => {
    const p = monthPeriod("2025-09-20");
    expect(p).toMatchObject({ ethYear: 2018, ethMonth: 1, fromDay: "2025-09-11", toDay: "2025-10-10" });
    expect(p.from).toBe("2025-09-10T21:00:00.000Z");
    expect(p.to).toBe("2025-10-10T21:00:00.000Z");
    expect([p.lastYear.fromDay, p.lastYear.toDay]).toEqual(["2024-09-11", "2024-10-10"]);
  });

  it("Pagume is a month of its own, 5 or 6 days", () => {
    const common = monthPeriod("2026-09-08");
    expect(common).toMatchObject({ ethYear: 2018, ethMonth: 13, fromDay: "2026-09-06", toDay: "2026-09-10" });
    const leap = monthPeriod("2027-09-11");
    expect(leap).toMatchObject({ ethYear: 2019, ethMonth: 13, fromDay: "2027-09-06", toDay: "2027-09-11" });
    // last year of a leap Pagume is the shorter common Pagume
    expect([leap.lastYear.fromDay, leap.lastYear.toDay]).toEqual(["2026-09-06", "2026-09-10"]);
  });

  it("month offsets cross the Ethiopian new year", () => {
    expect(monthPeriod("2026-09-11", -1)).toMatchObject({ ethYear: 2018, ethMonth: 13 });
    expect(monthPeriod("2026-09-10", 1)).toMatchObject({ ethYear: 2019, ethMonth: 1, fromDay: "2026-09-11" });
    expect(monthPeriod("2026-11-23")).toMatchObject({ ethMonth: 3, fromDay: "2026-11-10", toDay: "2026-12-09" });
  });

  it("last year of Pagume 6 clamps to Pagume 5", () => {
    expect(ethYearBack("2027-09-11")).toBe("2026-09-10");
    expect(dayPeriod("2027-09-11").lastYear.fromDay).toBe("2026-09-10");
  });

  it("custom range moves each end back one Ethiopian year", () => {
    const p = customPeriod("2026-11-10", "2026-11-23");
    expect(p.lastYear).toMatchObject({ fromDay: "2025-11-10", toDay: "2025-11-23" });
    expect(() => customPeriod("2026-11-23", "2026-11-10")).toThrow(RangeError);
  });

  it("untilToday cuts this month so far, and last year by the same number of days", () => {
    const p = untilToday(monthPeriod("2026-11-23"), "2026-11-23");
    expect([p.fromDay, p.toDay]).toEqual(["2026-11-10", "2026-11-23"]);
    expect([p.lastYear.fromDay, p.lastYear.toDay]).toEqual(["2025-11-10", "2025-11-23"]);
    expect(p.ethMonth).toBe(3);
    const past = monthPeriod("2026-11-23", -1);
    expect(untilToday(past, "2026-11-23")).toBe(past);
  });

  it("app-supplied periods", () => {
    const term: PeriodDef = {
      key: "term",
      label: { en: "This term", am: "ይህ ሴሚስተር", om: "Seemisteera kana" },
      resolve: () => ({ fromDay: "2026-09-15", toDay: "2027-01-20" }),
    };
    expect(extraPeriod(term, "2026-11-23")).toMatchObject({ kind: "term", fromDay: "2026-09-15", toDay: "2027-01-20" });
  });
});

describe("labels", () => {
  it("formats Ethiopian days, months and ranges", () => {
    expect(formatEthDay("2026-11-23", "en")).toBe("Hidar 14, 2019 E.C.");
    expect(formatEthDay("2026-11-23", "am")).toBe("ኅዳር 14, 2019 ዓ.ም.");
    expect(formatEthMonth(2019, 3, "om")).toBe("Sadaasa 2019 ALI");
    expect(formatEthRange("2026-11-23", "2026-11-29", "en")).toBe("Hidar 14 – 20, 2019 E.C.");
    expect(formatEthRange("2026-11-30", "2026-12-12", "en")).toBe("Hidar 21 – Tahsas 3, 2019 E.C.");
    expect(formatEthRange("2026-09-08", "2026-09-12", "en")).toBe("Pagume 3, 2018 – Meskerem 2, 2019 E.C.");
  });
});
