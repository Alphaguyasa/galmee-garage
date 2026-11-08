import { describe, expect, it } from "vitest";
import { plateKey } from "./plate";

describe("plateKey", () => {
  it("ignores spaces, dashes and case", () => {
    expect(plateKey("3-aa 12345")).toBe("3AA12345");
    expect(plateKey("3 AA-12345")).toBe("3AA12345");
  });
  it("keeps Ethiopic letters", () => {
    expect(plateKey("ኢት 2-12345")).toBe("ኢት212345");
  });
  it("drops everything else", () => {
    expect(plateKey("%_'")).toBe("");
  });
});
