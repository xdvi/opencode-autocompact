import { describe, expect, it } from "vitest";
import { DEFAULTS, fromFile, merge, parseArgs, toFile, validate } from "../src/autocompact/config";

describe("parseArgs", () => {
  it("on/off/status/keep/buffer", () => {
    expect(parseArgs("on")).toEqual({ kind: "auto", value: true });
    expect(parseArgs("off")).toEqual({ kind: "auto", value: false });
    expect(parseArgs("status")).toEqual({ kind: "status" });
    expect(parseArgs("keep 24000")).toEqual({ kind: "keep", value: 24000 });
    expect(parseArgs("buffer 16000")).toEqual({ kind: "buffer", value: 16000 });
  });
  it("vacio es status", () => {
    expect(parseArgs("")).toEqual({ kind: "status" });
  });
});

describe("validate", () => {
  it("rechaza negativos y no enteros", () => {
    expect(validate({ auto: true, keepTokens: -1, buffer: 20000 })).toHaveLength(1);
    expect(validate({ auto: true, keepTokens: 1.5, buffer: 20000 })).toHaveLength(1);
  });
  it("avisa keep mayor que umbral", () => {
    const warnings = validate({ auto: true, keepTokens: 200000, buffer: 20000 }, 108000);
    expect(warnings.some((w) => w.includes("keep"))).toBe(true);
  });
});

describe("merge", () => {
  it("preserva keys y aplica patch", () => {
    expect(merge({ auto: true, keepTokens: 15000, buffer: 20000 }, { auto: false })).toEqual({
      auto: false,
      keepTokens: 15000,
      buffer: 20000,
    });
  });
});

describe("file shape", () => {
  it("toFile usa keep.tokens", () => {
    expect(toFile({ auto: false, keepTokens: 24000, buffer: 16000 })).toEqual({
      auto: false,
      keep: { tokens: 24000 },
      buffer: 16000,
    });
  });
  it("fromFile aplica defaults", () => {
    expect(fromFile({})).toEqual(DEFAULTS);
    expect(fromFile({ auto: false, keep: { tokens: 1 }, buffer: 2 })).toEqual({
      auto: false,
      keepTokens: 1,
      buffer: 2,
    });
  });
});
