export function threshold(
  inputLimit: number,
  contextLimit: number,
  outputReserve: number,
  buffer: number,
): number {
  const cappedReserve = Math.min(outputReserve, 32000);
  return Math.min(inputLimit - buffer, contextLimit - Math.max(cappedReserve, buffer));
}

export function usagePct(used: number, ceiling: number): number {
  if (ceiling <= 0) return 100;
  return Math.min(100, Math.max(0, (used / ceiling) * 100));
}

export function tone(pct: number): "ok" | "warn" | "hot" {
  if (pct >= 90) return "hot";
  if (pct >= 75) return "warn";
  return "ok";
}

export function autoBuffer(contextLimit: number): number {
  if (contextLimit <= 32000) {
    return Math.max(2000, Math.round(contextLimit * 0.15));
  }
  if (contextLimit <= 128000) {
    return Math.max(8000, Math.round(contextLimit * 0.15));
  }
  if (contextLimit <= 200000) {
    return 20000;
  }
  return Math.min(50000, Math.round(contextLimit * 0.1));
}

export function isValidPercent(percent: number): boolean {
  return Number.isFinite(percent) && percent > 0 && percent < 100;
}

export function bufferForPercent(limit: number, percent: number): number {
  if (!isValidPercent(percent)) {
    throw new Error(`percent must be between 1 and 99 (received ${percent}%)`);
  }
  const target = Math.round((limit * percent) / 100);
  const buffer = limit - target;
  if (!Number.isInteger(buffer) || buffer <= 0) {
    throw new Error(`calculated buffer must be a positive integer`);
  }
  return buffer;
}

export function renderProgressBar(used: number, target: number, width = 10): string {
  if (target <= 0) return "░".repeat(width);
  const ratio = Math.min(1, Math.max(0, used / target));
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}


