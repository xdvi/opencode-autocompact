import { describe, expect, it } from "vitest";
import { threshold, usagePct, tone } from "../src/autocompact/status";

describe("threshold", () => {
  it("usa input limit menos buffer", () => {
    expect(threshold(128000, 200000, 32000, 20000)).toBe(108000);
  });
  it("respeta context limit con output reserve", () => {
    expect(threshold(500000, 200000, 32000, 20000)).toBe(168000);
  });
});

describe("usagePct", () => {
  it("calcula porcentaje", () => {
    expect(usagePct(54000, 108000)).toBe(50);
  });
});

describe("tone", () => {
  it("ok < 75, warn < 90, hot el resto", () => {
    expect(tone(50)).toBe("ok");
    expect(tone(80)).toBe("warn");
    expect(tone(95)).toBe("hot");
  });
});
