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
