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

