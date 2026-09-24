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
  | { kind: "target"; value: number };

function parseCount(raw: string): number {
  const match = /^(\d+(?:\.\d+)?)(k|m)?$/i.exec(raw.trim());
  if (!match) throw new Error(`"${raw}" no es un número (usa 300000, 300k o 1m)`);
  const base = Number(match[1]);
  const suffix = (match[2] ?? "").toLowerCase();
  const value = base * (suffix === "m" ? 1000000 : suffix === "k" ? 1000 : 1);
  if (!Number.isFinite(value)) throw new Error(`"${raw}" no es un número`);
  return Math.round(value);
}

export function formatCount(n: number): string {
  if (n >= 1000000 && n % 1000000 === 0) return `${n / 1000000}M`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}k`;
  return String(n);
}

export function bufferForTarget(limit: number, target: number): number {
  const buffer = limit - target;
  if (!Number.isInteger(buffer) || buffer <= 0) {
    throw new Error(`target debe ser menor que el límite ${formatCount(limit)}`);
  }
  return buffer;
}

export function parseArgs(input: string): ConfigAction {
  const parts = input.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0 || parts[0] === "status") {
    if (parts.length > 1) throw new Error("uso: /autocompact [on|off|status|keep <n>|buffer <n>|target <n>]");
    return { kind: "status" };
  }
  const [cmd, raw, ...rest] = parts;
  if (rest.length > 0) throw new Error("uso: /autocompact [on|off|status|keep <n>|buffer <n>|target <n>]");
  if (cmd === "on" && raw === undefined) return { kind: "auto", value: true };
  if (cmd === "off" && raw === undefined) return { kind: "auto", value: false };
  if ((cmd === "keep" || cmd === "buffer") && raw !== undefined) {
    return { kind: cmd, value: parseCount(raw) } as ConfigAction;
  }
  if (cmd === "target" && raw !== undefined) {
    return { kind: "target", value: parseCount(raw) };
  }
  throw new Error("uso: /autocompact [on|off|status|keep <n>|buffer <n>|target <n>]");
}

export function validate(entry: CompactionConfig, _ceiling?: number): string[] {
  const errors: string[] = [];
  for (const [k, v] of [
    ["keepTokens", entry.keepTokens],
    ["buffer", entry.buffer],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) errors.push(`${k} debe ser entero >= 0`);
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
    warnings.push(`keep (${entry.keepTokens}) deja sin margen bajo el umbral ${ctx.ceiling}`);
  }
  if (ctx.inputLimit !== undefined && entry.buffer >= ctx.inputLimit) {
    warnings.push(`buffer (${entry.buffer}) dispara el auto de inmediato con input limit ${ctx.inputLimit}`);
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
