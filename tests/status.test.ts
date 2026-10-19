import { describe, expect, it } from "vitest";
import {
  threshold,
  usagePct,
  tone,
  autoBuffer,
  bufferForPercent,
  renderProgressBar,
} from "../src/autocompact/status";

describe("threshold", () => {
  it("uses input limit minus buffer", () => {
    expect(threshold(128000, 200000, 32000, 20000)).toBe(108000);
  });
  it("respects context limit with output reserve", () => {
    expect(threshold(500000, 200000, 32000, 20000)).toBe(168000);
  });
});

describe("usagePct", () => {
  it("calculates usage percentage", () => {
    expect(usagePct(54000, 108000)).toBe(50);
  });
});

describe("tone", () => {
  it("classifies tone as ok < 75, warn < 90, and hot for the rest", () => {
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

describe("bufferForPercent", () => {
  it("calculates buffer given context limit and target percentage", () => {
    expect(bufferForPercent(200000, 80)).toBe(40000);
    expect(bufferForPercent(128000, 75)).toBe(32000);
  });
  it("throws on invalid percentage", () => {
    expect(() => bufferForPercent(200000, 0)).toThrow();
    expect(() => bufferForPercent(200000, 100)).toThrow();
    expect(() => bufferForPercent(200000, 110)).toThrow();
  });
});

describe("isValidPercent", () => {
  it("validates percentages between 1 and 99", async () => {
    const { isValidPercent } = await import("../src/autocompact/status");
    expect(isValidPercent(50)).toBe(true);
    expect(isValidPercent(1)).toBe(true);
    expect(isValidPercent(99)).toBe(true);
    expect(isValidPercent(0)).toBe(false);
    expect(isValidPercent(100)).toBe(false);
    expect(isValidPercent(-5)).toBe(false);
    expect(isValidPercent(NaN)).toBe(false);
  });
});

describe("renderProgressBar", () => {
  it("renders unicode progress bar correctly", () => {
    expect(renderProgressBar(0, 100, 10)).toBe("░░░░░░░░░░");
    expect(renderProgressBar(50, 100, 10)).toBe("█████░░░░░");
    expect(renderProgressBar(100, 100, 10)).toBe("██████████");
    expect(renderProgressBar(80, 100, 10)).toBe("████████░░");
  });
});
