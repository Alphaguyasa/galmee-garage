import { describe, expect, it } from "vitest";
import { parsePayAmount } from "./pay-amount";

describe("parsePayAmount", () => {
  it("reads plain and grouped amounts", () => {
    expect(parsePayAmount("1250")).toBe(1250);
    expect(parsePayAmount(" 1,250.50 ")).toBe(1250.5);
  });
  it("refuses zero, negatives, text and more than 2 decimals", () => {
    for (const bad of ["", "0", "-5", "abc", "12.345", "1e3", "200000000"]) expect(parsePayAmount(bad)).toBeNull();
  });
});
