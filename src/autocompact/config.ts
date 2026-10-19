import { readFileSync, writeFileSync } from "node:fs";

export interface CompactionConfig {
  auto: boolean;
  keepTokens: number;
  buffer: number;
}

export const DEFAULTS: CompactionConfig = { auto: true, keepTokens: 15000, buffer: 20000 };

export type ConfigAction =
  | { kind: "status" }
  | { kind: "auto"; value: boolean }
  | { kind: "keep"; value: number }
  | { kind: "buffer"; value: number }
  | { kind: "target"; value: number }
  | { kind: "percent"; value: number };

function parsePercent(raw: string): number {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(raw.trim());
  if (!match) throw new Error(`"${raw}" is not a valid percentage (use e.g. 80%)`);
  const val = Number(match[1]);
  if (!Number.isFinite(val) || val <= 0 || val >= 100) {
    throw new Error(`percentage must be between 1 and 99 (received ${raw})`);
  }
  return Math.round(val);
}

function parseCount(raw: string): number {
  const match = /^(\d+(?:\.\d+)?)(k|m)?$/i.exec(raw.trim());
  if (!match) throw new Error(`"${raw}" is not a valid number (use e.g. 300000, 300k, or 1m)`);
  const base = Number(match[1]);
  const suffix = (match[2] ?? "").toLowerCase();
  const value = base * (suffix === "m" ? 1000000 : suffix === "k" ? 1000 : 1);
  if (!Number.isFinite(value)) throw new Error(`"${raw}" is not a valid number`);
  return Math.round(value);
}

export function formatCount(n: number): string {
  if (n >= 1000000 && n % 1000000 === 0) return `${n / 1000000}M`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}k`;
  if (n >= 1000) return `~${Math.round(n / 1000)}k`;
  return String(n);
}

export function bufferForTarget(limit: number, target: number): number {
  const buffer = limit - target;
  if (!Number.isInteger(buffer) || buffer <= 0) {
    throw new Error(`target must be less than limit ${formatCount(limit)}`);
  }
  return buffer;
}

export function parseArgs(input: string): ConfigAction {
  const parts = input.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0 || parts[0] === "status") {
    if (parts.length > 1) {
      throw new Error("usage: /autocompact [auto|on|off|status|reset|keep <n>|buffer <n>|target <n|pct%>]");
    }
    return { kind: "status" };
  }
  const [cmd, raw, ...rest] = parts;
  if (rest.length > 0) {
    throw new Error("usage: /autocompact [auto|on|off|status|reset|keep <n>|buffer <n>|target <n|pct%>]");
  }
  const normalized = cmd.toLowerCase();
  if ((normalized === "on" || normalized === "auto" || normalized === "reset" || normalized === "default") && raw === undefined) {
    return { kind: "auto", value: true };
  }
  if (normalized === "off" && raw === undefined) return { kind: "auto", value: false };
  if ((normalized === "keep" || normalized === "buffer") && raw !== undefined) {
    return { kind: normalized as "keep" | "buffer", value: parseCount(raw) };
  }
  if (normalized === "target" && raw !== undefined) {
    if (raw.endsWith("%")) {
      return { kind: "percent", value: parsePercent(raw) };
    }
    return { kind: "target", value: parseCount(raw) };
  }
  if (raw === undefined) {
    if (cmd.endsWith("%")) {
      return { kind: "percent", value: parsePercent(cmd) };
    }
    if (/^(\d+(?:\.\d+)?)(k|m)?$/i.test(cmd)) {
      return { kind: "target", value: parseCount(cmd) };
    }
  }
  throw new Error("usage: /autocompact [auto|on|off|status|reset|keep <n>|buffer <n>|target <n|pct%>]");
}

export function validate(entry: CompactionConfig, _ceiling?: number): string[] {
  const errors: string[] = [];
  for (const [k, v] of [
    ["keepTokens", entry.keepTokens],
    ["buffer", entry.buffer],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) errors.push(`${k} must be an integer >= 0`);
  }
  return errors;
}

export interface AdviseContext {
  ceiling?: number;
  inputLimit?: number;
}

export function advise(entry: CompactionConfig, ctx: AdviseContext): string[] {
  const warnings: string[] = [];
  if (ctx.ceiling !== undefined && entry.keepTokens > ctx.ceiling) {
    warnings.push(`keep (${entry.keepTokens}) leaves no headroom below threshold ${ctx.ceiling}`);
  }
  if (ctx.inputLimit !== undefined && entry.buffer >= ctx.inputLimit) {
    warnings.push(`buffer (${entry.buffer}) triggers autocompact immediately with input limit ${ctx.inputLimit}`);
  }
  return warnings;
}

export function merge(base: CompactionConfig, patch: Partial<CompactionConfig>): CompactionConfig {
  return { ...base, ...patch };
}

export interface CompactionFile {
  auto?: boolean;
  keep?: { tokens?: number };
  buffer?: number;
}

export function toFile(entry: CompactionConfig): Required<CompactionFile> {
  return { auto: entry.auto, keep: { tokens: entry.keepTokens }, buffer: entry.buffer };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function fromFile(file: CompactionFile): CompactionConfig {
  const keepTokens = isRecord(file.keep) && Number.isInteger(file.keep.tokens) ? file.keep.tokens : undefined;
  return {
    auto: typeof file.auto === "boolean" ? file.auto : DEFAULTS.auto,
    keepTokens: keepTokens ?? DEFAULTS.keepTokens,
    buffer: Number.isInteger(file.buffer) && (file.buffer as number) >= 0 ? (file.buffer as number) : DEFAULTS.buffer,
  };
}

function stripJsonc(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

export function readDoc(path: string): Record<string, unknown> {
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return JSON.parse(stripJsonc(raw)) as Record<string, unknown>;
  }
}

export async function persist(path: string, patch: Partial<CompactionConfig>): Promise<CompactionConfig> {
  const doc = readDoc(path);
  const prev = isRecord(doc.compaction) ? (doc.compaction as CompactionFile) : {};
  const next = merge(fromFile(prev), patch);
  const errors = validate(next);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  doc.compaction = { ...prev, ...toFile(next) };
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  return next;
}
