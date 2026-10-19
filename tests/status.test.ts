import { describe, expect, it } from "vitest";
import { threshold, usagePct, tone, autoBuffer } from "../src/autocompact/status";

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

describe("autoBuffer", () => {
  it("tunes buffer for small models", () => {
    expect(autoBuffer(8000)).toBe(2000);
    expect(autoBuffer(32000)).toBe(4800);
  });
  it("tunes buffer for 128k and 200k models", () => {
    expect(autoBuffer(128000)).toBe(19200);
    expect(autoBuffer(200000)).toBe(20000);
  });
  it("caps buffer for 1M+ models", () => {
    expect(autoBuffer(1000000)).toBe(50000);
  });
});

