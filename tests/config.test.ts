import { describe, expect, it } from "vitest";
import {
  advise,
  DEFAULTS,
  fromFile,
  merge,
  parseArgs,
  persist,
  readDoc,
  toFile,
  validate,
} from "../src/autocompact/config";

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
  it("rechaza no-finitos y tokens extra", () => {
    expect(() => parseArgs("keep abc")).toThrow();
    expect(() => parseArgs("keep Infinity")).toThrow();
    expect(() => parseArgs("keep 1 extra")).toThrow();
    expect(() => parseArgs("frobnicate")).toThrow();
  });
});

describe("validate", () => {
  it("rechaza negativos y no enteros", () => {
    expect(validate({ auto: true, keepTokens: -1, buffer: 20000 })).toHaveLength(1);
    expect(validate({ auto: true, keepTokens: 1.5, buffer: 20000 })).toHaveLength(1);
  });
  it("no avisa: solo bloquea", () => {
    expect(validate({ auto: true, keepTokens: 200000, buffer: 20000 }, 108000)).toHaveLength(0);
  });
});

describe("advise", () => {
  it("avisa keep mayor que umbral", () => {
    const warnings = advise({ auto: true, keepTokens: 200000, buffer: 20000 }, { ceiling: 108000 });
    expect(warnings.some((w) => w.includes("keep"))).toBe(true);
  });
  it("avisa buffer mayor que input limit", () => {
    const warnings = advise({ auto: true, keepTokens: 15000, buffer: 200000 }, { inputLimit: 128000 });
    expect(warnings.some((w) => w.includes("buffer"))).toBe(true);
  });
  it("sin contexto no avisa", () => {
    expect(advise({ auto: true, keepTokens: 200000, buffer: 200000 }, {})).toHaveLength(0);
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

describe("file shape", () => {  it("toFile usa keep.tokens", () => {
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

describe("fromFile hardens types", () => {
  it("descarta tipos inválidos a defaults", () => {
    expect(fromFile({ auto: "yes" as never, keep: { tokens: "x" as never }, buffer: -1 })).toEqual({
      auto: true,
      keepTokens: 15000,
      buffer: 20000,
    });
  });
});

describe("persist", () => {
  it("mergea sin perder keys ajenas y bloquea inválidos sin mutar", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "autocompact-"));
    const path = join(dir, "opencode.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      path,
      JSON.stringify({ mcp: { servers: {} }, compaction: { auto: true, keep: { tokens: 1 }, extra: 9 } }),
    );
    const next = await persist(path, { auto: false });
    expect(next.auto).toBe(false);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    expect(doc.mcp).toEqual({ servers: {} });
    expect(doc.compaction.extra).toBe(9);
    await expect(persist(path, { keepTokens: -5 })).rejects.toThrow();
    expect(JSON.parse(readFileSync(path, "utf8")).compaction.keep.tokens).toBe(1);
  });
  it("tolera comentarios jsonc", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "autocompact-"));
    const path = join(dir, "opencode.jsonc");
    writeFileSync(path, `{\n// comentario\n"compaction": { "auto": false }\n}`);
    expect((readDoc(path).compaction as { auto: boolean }).auto).toBe(false);
  });
});
