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
  | { kind: "buffer"; value: number };

export function parseArgs(input: string): ConfigAction {
  const [cmd, raw] = input.trim().split(/\s+/, 2);
  if (!cmd || cmd === "status") return { kind: "status" };
  if (cmd === "on") return { kind: "auto", value: true };
  if (cmd === "off") return { kind: "auto", value: false };
  if ((cmd === "keep" || cmd === "buffer") && raw !== undefined) {
    return { kind: cmd, value: Number(raw) } as ConfigAction;
  }
  throw new Error("uso: /autocompact [on|off|status|keep <n>|buffer <n>]");
}

export function validate(entry: CompactionConfig, ceiling?: number): string[] {
  const errors: string[] = [];
  for (const [k, v] of [
    ["keepTokens", entry.keepTokens],
    ["buffer", entry.buffer],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) errors.push(`${k} debe ser entero >= 0`);
  }
  if (ceiling !== undefined && entry.keepTokens > ceiling) {
    errors.push(`keep (${entry.keepTokens}) deja sin margen bajo el umbral ${ceiling}`);
  }
  return errors;
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

export function fromFile(file: CompactionFile): CompactionConfig {
  return {
    auto: file.auto ?? DEFAULTS.auto,
    keepTokens: file.keep?.tokens ?? DEFAULTS.keepTokens,
    buffer: file.buffer ?? DEFAULTS.buffer,
  };
}
