import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { customPeriod, dayPeriod, monthPeriod, untilToday, weekPeriod, type PeriodDef } from "@/lib/galmee/eth-calendar";
import {
  dayOptions,
  fieldsToDay,
  lastYearLabel,
  MAX_BACK,
  periodStrings,
  resolveChoice,
  stepChoice,
  validateCustom,
  yearOptions,
  type PeriodChoice,
} from "@/lib/galmee/period-picker";
import { EthDateFields, PeriodPicker } from "./period-picker";

const TODAY = "2026-11-25"; // Hidar 16, 2019, a Wednesday
const term: PeriodDef = {
  key: "term",
  label: { en: "This term", am: "ይህ ተርም", om: "Teermii kana" },
  resolve: () => ({ fromDay: "2026-09-15", toDay: "2027-01-20" }),
};

const pick = (choice: PeriodChoice, lang = "en") => resolveChoice(choice, TODAY, lang, [term]);
const range = (p: { from: string; to: string; lastYear: { from: string; to: string } }) => [p.from, p.to, p.lastYear.from, p.lastYear.to];

describe("emitted ranges equal the calendar math", () => {
  it("today and earlier days", () => {
    expect(range(pick({ kind: "today" }))).toEqual(range(dayPeriod(TODAY)));
    expect(range(pick({ kind: "today", offset: -3 }))).toEqual(range(dayPeriod(TODAY, -3)));
  });
  it("this week so far, and whole earlier weeks", () => {
    const p = pick({ kind: "week" });
    expect(range(p)).toEqual(range(untilToday(weekPeriod(TODAY), TODAY)));
    expect([p.fromDay, p.toDay]).toEqual(["2026-11-23", "2026-11-25"]);
    expect([p.lastYear.fromDay, p.lastYear.toDay]).toEqual(["2025-11-24", "2025-11-26"]);
    expect(range(pick({ kind: "week", offset: -1 }))).toEqual(range(weekPeriod(TODAY, -1)));
  });
  it("this Ethiopian month so far, and whole earlier months", () => {
    const p = pick({ kind: "month" });
    expect(range(p)).toEqual(range(untilToday(monthPeriod(TODAY), TODAY)));
    expect([p.fromDay, p.toDay]).toEqual(["2026-11-10", "2026-11-25"]);
    expect(range(pick({ kind: "month", offset: -3 }))).toEqual(range(monthPeriod(TODAY, -3)));
    expect(pick({ kind: "month", offset: -3 }).label).toBe("Pagume 2018 E.C.");
  });
  it("custom ranges, in either order", () => {
    expect(range(pick({ kind: "custom", fromDay: "2026-10-01", toDay: "2026-10-31" }))).toEqual(range(customPeriod("2026-10-01", "2026-10-31")));
    expect(range(pick({ kind: "custom", fromDay: "2026-10-31", toDay: "2026-10-01" }))).toEqual(range(customPeriod("2026-10-01", "2026-10-31")));
  });
  it("app periods, and an unknown key falls back to today", () => {
    expect(pick({ kind: "extra", key: "term" })).toMatchObject({ kind: "term", title: "This term", fromDay: "2026-09-15" });
    expect(pick({ kind: "extra", key: "gone" }).kind).toBe("today");
  });
  it("never goes into the future or past the limit", () => {
    expect(pick({ kind: "month", offset: 4 }).fromDay).toBe("2026-11-10");
    expect(pick({ kind: "today", offset: -10_000 }).fromDay).toBe(dayPeriod(TODAY, -MAX_BACK.today).fromDay);
  });
});

describe("titles, labels and arrows", () => {
  it("names the current period, dates for the others", () => {
    expect(pick({ kind: "today" })).toMatchObject({ title: "Today", label: "Hidar 16, 2019 E.C." });
    expect(pick({ kind: "week" }, "am")).toMatchObject({ title: "ይህ ሳምንት", label: "ኅዳር 14 – 16, 2019 ዓ.ም." });
    expect(pick({ kind: "month", offset: -1 }, "om").title).toBe("Onkoloolessa 2019 ALI");
    expect(lastYearLabel(pick({ kind: "today" }), "en")).toBe("Last year: Hidar 16, 2018 E.C.");
  });
  it("steps back, and forward only up to now", () => {
    expect(stepChoice({ kind: "week" }, -1)).toEqual({ kind: "week", offset: -1 });
    expect(stepChoice({ kind: "week" }, 1)).toBeNull();
    expect(stepChoice({ kind: "week", offset: -1 }, 1)).toEqual({ kind: "week", offset: 0 });
    expect(stepChoice({ kind: "month", offset: -MAX_BACK.month }, -1)).toBeNull();
    expect(stepChoice({ kind: "custom", fromDay: TODAY, toDay: TODAY }, -1)).toBeNull();
  });
  it("has every string in all three languages", () => {
    const keys = Object.keys(periodStrings("en")).sort();
    for (const l of ["am", "om"]) expect(Object.keys(periodStrings(l)).sort()).toEqual(keys);
    expect(periodStrings("xx")).toBe(periodStrings("en"));
  });
});

describe("custom range fields", () => {
  it("offers this Ethiopian year and five before", () => {
    expect(yearOptions(TODAY)).toEqual([2019, 2018, 2017, 2016, 2015, 2014]);
  });
  it("gives Pagume 5 or 6 days and clamps the day", () => {
    expect(dayOptions(2019, 13)).toHaveLength(6);
    expect(dayOptions(2018, 13)).toHaveLength(5);
    expect(fieldsToDay({ year: 2018, month: 13, day: 6 })).toBe("2026-09-10");
    expect(validateCustom("2026-11-02", "2026-11-01")).toBe("endsBeforeStart");
    expect(validateCustom("2026-11-01", "2026-11-01")).toBe("ok");
  });
});

describe("<PeriodPicker>", () => {
  const html = (value: PeriodChoice, lang = "en", extras: PeriodDef[] = []) =>
    renderToStaticMarkup(createElement(PeriodPicker, { lang, today: TODAY, value, onChange: () => {}, extras }));

  it("this week: tab pressed, back arrow on, forward arrow off", () => {
    const out = html({ kind: "week" });
    expect(out).toMatch(/aria-pressed="true"[^>]*>This week</);
    expect(out).toContain("data-period-title");
    expect(out).toContain("Hidar 14 – 16, 2019 E.C.");
    expect(out).toContain("Last year: Hidar 15 – 17, 2018 E.C.");
    expect(out).toMatch(/aria-label="Later" disabled=""/);
    expect(out).not.toMatch(/aria-label="Earlier" disabled=""/);
  });
  it("custom: no arrows, the Pick dates chip pressed", () => {
    const out = html({ kind: "custom", fromDay: "2026-10-01", toDay: "2026-10-31" }, "am");
    expect(out).not.toContain('aria-label="ቀደም ያለ"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>ቀን ምረጥ</);
  });
  it("shows app periods as tabs", () => {
    expect(html({ kind: "extra", key: "term" }, "en", [term])).toMatch(/aria-pressed="true"[^>]*>This term</);
    expect(html({ kind: "today" })).not.toContain("This term");
  });
  it("date fields list the month's days and Ethiopian months", () => {
    const out = renderToStaticMarkup(
      createElement(EthDateFields, { legend: "From", lang: "om", today: TODAY, value: { year: 2019, month: 13, day: 6 }, onChange: () => {} }),
    );
    expect(out).toContain('aria-label="From Guyyaa"');
    expect(out).toContain(">Qaammee</option>");
    expect((out.match(/<option value="\d"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});
