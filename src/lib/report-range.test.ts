import { describe, expect, it } from "vitest";
import { parseReportRange, reportRangeDates } from "./report-range";

describe("report ranges", () => {
  it("falls back to 14 days for unknown values", () => {
    expect(parseReportRange("week")).toBe("week");
    expect(parseReportRange("9")).toBe("14");
    expect(parseReportRange(null)).toBe("14");
  });

  it("today is a single day", () => {
    expect(reportRangeDates("today", "2026-11-10")).toEqual({ from: "2026-11-10", to: "2026-11-10" });
  });

  it("week starts on Monday", () => {
    // 2026-11-10 is a Tuesday; 2026-11-09 a Monday; 2026-11-15 a Sunday.
    expect(reportRangeDates("week", "2026-11-10").from).toBe("2026-11-09");
    expect(reportRangeDates("week", "2026-11-09").from).toBe("2026-11-09");
    expect(reportRangeDates("week", "2026-11-15").from).toBe("2026-11-09");
  });

  it("month starts on the first of the Ethiopian month", () => {
    // Hidar 1, 2019 E.C. is 2026-11-10.
    expect(reportRangeDates("month", "2026-11-10").from).toBe("2026-11-10");
    expect(reportRangeDates("month", "2026-11-09").from).toBe("2026-10-11");
    // Pagume 2018 E.C. (leap year: 6 days) starts 2026-09-06.
    expect(reportRangeDates("month", "2026-09-10")).toEqual({ from: "2026-09-06", to: "2026-09-10" });
  });

  it("last N days include today", () => {
    expect(reportRangeDates("7", "2026-11-10").from).toBe("2026-11-04");
    expect(reportRangeDates("30", "2026-11-10").from).toBe("2026-10-12");
  });
});
