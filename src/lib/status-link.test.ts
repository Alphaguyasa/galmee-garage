import { describe, expect, it } from "vitest";
import { customerSteps, isStatusToken, showAmountDue } from "./status-link";

describe("status link", () => {
  it("accepts only 48 lowercase hex characters", () => {
    expect(isStatusToken("a".repeat(48))).toBe(true);
    expect(isStatusToken("A".repeat(48))).toBe(false);
    expect(isStatusToken("a".repeat(47))).toBe(false);
    expect(isStatusToken(`${"a".repeat(47)}'`)).toBe(false);
  });

  it("shows a new job as received, with the rest to come", () => {
    expect(customerSteps("open")).toEqual([
      { key: "received", state: "current" },
      { key: "in_progress", state: "todo" },
      { key: "ready", state: "todo" },
      { key: "delivered", state: "todo" },
    ]);
  });

  it("adds the waiting-for-parts step only while waiting", () => {
    expect(customerSteps("waiting_parts")?.map((s) => `${s.key}:${s.state}`)).toEqual([
      "received:done",
      "in_progress:done",
      "waiting_parts:current",
      "ready:todo",
      "delivered:todo",
    ]);
    expect(customerSteps("ready")?.some((s) => s.key === "waiting_parts")).toBe(false);
  });

  it("marks every step done once handed over, and has no steps when cancelled", () => {
    expect(customerSteps("delivered")?.every((s) => s.state === "done")).toBe(true);
    expect(customerSteps("cancelled")).toBeNull();
  });

  it("shows the amount due only when the car is ready or handed over", () => {
    expect(showAmountDue("in_progress", 500)).toBe(false);
    expect(showAmountDue("ready", 500)).toBe(true);
    expect(showAmountDue("ready", 0)).toBe(false);
    expect(showAmountDue("delivered", 20)).toBe(true);
  });
});
