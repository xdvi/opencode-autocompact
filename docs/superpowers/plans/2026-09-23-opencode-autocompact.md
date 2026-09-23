# opencode-autocompact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a path-loaded opencode v2 plugin exposing `/autocompact` TUI control over the existing `compaction.*` config.

**Architecture:** Pure functions (`status.ts`, `config.ts`) hold threshold math and validation under vitest; `tui.tsx` wires slash, footer slot and toasts; `index.ts` is a server stub. Persistence is direct `opencode.json(c)` edit under a watched config dir (server reloads automatically).

**Tech Stack:** TypeScript, `@opencode/plugin`, `@opencode/plugin/tui`, `@opentui/core`, `@opentui/solid`, `solid-js`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-opencode-autocompact-design.md`

## Global Constraints

- scope solo `/autocompact`; no tocar `/compact` nativo.
- `keep.tokens` y `buffer`: enteros ≥ 0.
- defaults: `auto: true`, `keep.tokens: 15000`, `buffer: 20000`.
- commits convencionales en minúsculas, sin atribución ia.
- preservar keys ajenas al editar `opencode.json(c)`.

## Review Focus

- `keep abc` o `keep -5` → dialog de error, sin mutar nada.
- `buffer` mayor que el input limit → aviso, se acepta pero se marca que el auto disparará de inmediato.
- `keep.tokens` mayor que el umbral → aviso de que no queda margen para trabajo nuevo.
- edición concurrente de `opencode.json(c)` → merge preservando keys ajenas, nunca overwrite ciego.
- server remoto (sin acceso al archivo) → toast explicando que la escritura local no aplica.

---

### Task 1: scaffold del paquete

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `opencode.jsonc`
- Create: `README.md`

**Interfaces:**
- Consumes: nada.
- Produces: exports `"."` → `src/index.ts` y `"./tui"` → `src/tui.tsx` para las tasks 3-4.

- [ ] **Step 1: crear `package.json`**

```json
{
  "name": "opencode-autocompact",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tui": "./src/tui.tsx"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode/plugin": "latest"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.7"
  },
  "peerDependencies": {
    "@opentui/core": ">=0.5.8",
    "@opentui/solid": ">=0.5.8",
    "solid-js": ">=1.9.0"
  }
}
```

- [ ] **Step 2: crear `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: crear `opencode.jsonc` de ejemplo local**

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "compaction": {
    "auto": true,
    "keep": { "tokens": 15000 },
    "buffer": 20000,
  },
}
```

- [ ] **Step 4: crear `README.md`**

```md
# opencode-autocompact

/autocompact on|off|status — control TUI de compaction.auto.
/autocompact keep <n> | buffer <n> — ajuste validado.
```

- [ ] **Step 5: instalar y verificar**

Run: `npm install && npm run typecheck`
Expected: PASS sin errores (aún sin `src/`, solo config).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json opencode.jsonc README.md
git commit -m "chore: scaffold paquete opencode-autocompact"
```

### Task 2: `status.ts` — umbral y % (puro, TDD)

**Files:**
- Create: `src/autocompact/status.ts`
- Test: `tests/status.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `threshold(inputLimit, contextLimit, outputReserve, buffer): number`, `usagePct(used, threshold): number`, `tone(pct): "ok" | "warn" | "hot"` para la task 4.

Regla (de docs compaction): techo = `min(input limit - buffer, context limit - max(output reserve, buffer))`.

- [ ] **Step 1: escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { threshold, usagePct, tone } from "../src/autocompact/status";

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
```

- [ ] **Step 2: correr y ver fallar**

Run: `npx vitest run tests/status.test.ts`
Expected: FAIL con "failed to load" (no existe `src/autocompact/status.ts`).

- [ ] **Step 3: implementación mínima**

```ts
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
```

- [ ] **Step 4: correr y ver pasar**

Run: `npx vitest run tests/status.test.ts`
Expected: PASS 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/autocompact/status.ts tests/status.test.ts
git commit -m "feat: calculo de umbral y tono de compaction"
```

### Task 3: `config.ts` — validación y persistencia (TDD)

**Files:**
- Create: `src/autocompact/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `parseArgs(input: string): ConfigAction`, `validate(entry): string[]`, `merge(base, patch): CompactionConfig`, `toFile` / `fromFile` para la task 4.

`CompactionConfig = { auto: boolean; keepTokens: number; buffer: number }`.
Defaults: `{ auto: true, keepTokens: 15000, buffer: 20000 }`.

- [ ] **Step 1: escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { merge, parseArgs, validate } from "../src/autocompact/config";

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
    const warnings = validate({ auto: true, keepTokens: 200000, buffer: 20000 });
    expect(warnings.some((w) => w.includes("keep"))).toBe(true);
  });
});

describe("merge", () => {
  it("preserva keys y aplica patch", () => {
    expect(merge({ auto: true, keepTokens: 15000, buffer: 20000 }, { auto: false }))
      .toEqual({ auto: false, keepTokens: 15000, buffer: 20000 });
  });
});
```

- [ ] **Step 2: correr y ver fallar**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL con "failed to load".

- [ ] **Step 3: implementación mínima**

```ts
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
  throw new Error(`uso: /autocompact [on|off|status|keep <n>|buffer <n>]`);
}

export function validate(entry: CompactionConfig): string[] {
  const errors: string[] = [];
  for (const [k, v] of [["keepTokens", entry.keepTokens], ["buffer", entry.buffer]] as const) {
    if (!Number.isInteger(v) || v < 0) errors.push(`${k} debe ser entero >= 0`);
  }
  return errors;
}

export function merge(base: CompactionConfig, patch: Partial<CompactionConfig>): CompactionConfig {
  return { ...base, ...patch };
}
```

- [ ] **Step 4: correr y ver pasar**

Run: `npx vitest run`
Expected: PASS todos.

- [ ] **Step 5: test de mapeo a forma de archivo**

```ts
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
```

- [ ] **Step 6: implementación del mapeo**

```ts
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
```

- [ ] **Step 7: correr y ver pasar**

Run: `npx vitest run`
Expected: PASS todos.

- [ ] **Step 8: Commit**

```bash
git add src/autocompact/config.ts tests/config.test.ts
git commit -m "feat: parse y validacion de config compaction"
```

### Task 4: `tui.tsx` + stub server + alta global

**Files:**
- Create: `src/index.ts`
- Create: `src/tui.tsx`
- Modify: `/home/dabi/.config/opencode/opencode.json` (agregar path al array `plugins`)

**Interfaces:**
- Consumes: `parseArgs`, `validate`, `merge`, `DEFAULTS`, `toFile`, `fromFile` (task 3); `threshold`, `usagePct`, `tone` (task 2).
- Produces: slash `/autocompact` funcional y footer `auto:on 62%`.

Persistencia: editar el `opencode.json(c)` gestionado con `node:fs` preservando keys ajenas (parse JSONC simple: leer, reemplazar bloque `compaction`, escribir). El server recarga config automáticamente en dirs vigilados. Si el CWD es remoto, toast explicando que no aplica.

- [ ] **Step 1: crear `src/index.ts` (stub)**

```ts
import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "autocompact.server",
  setup() {},
});
```

- [ ] **Step 2: crear `src/tui.tsx`**

```tsx
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin/tui";
import { DEFAULTS, fromFile, merge, parseArgs, toFile, validate } from "./autocompact/config";

const GLOBAL_CONFIG = join(homedir(), ".config", "opencode", "opencode.json");

async function persist(patch: { auto?: boolean; keepTokens?: number; buffer?: number }) {
  const raw = await readFile(GLOBAL_CONFIG, "utf8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const next = merge(fromFile((doc.compaction ?? {}) as never), patch);
  const errors = validate(next);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  doc.compaction = toFile(next);
  await writeFile(GLOBAL_CONFIG, JSON.stringify(doc, null, 2) + "\n");
  return next;
}

export default Plugin.define({
  id: "autocompact.cli",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "autocompact.run",
          title: "autocompact on|off|status|keep|buffer",
          slash: { name: "autocompact", arguments: true },
          run: async (input) => {
            let action;
            try {
              action = parseArgs(input ?? "");
            } catch (error) {
              await context.ui.dialog.alert({ title: "autocompact", message: String(error) });
              return;
            }
            if (action.kind === "status") {
              const current = { ...DEFAULTS };
              context.ui.toast.show({ message: `auto:${current.auto ? "on" : "off"} keep:${current.keepTokens} buffer:${current.buffer}` });
              return;
            }
            const patch = action.kind === "auto" ? { auto: action.value } : action.kind === "keep" ? { keepTokens: action.value } : { buffer: action.value };
            try {
              const next = await persist(patch);
              context.ui.toast.show({ message: `autocompact actualizado auto:${next.auto ? "on" : "off"}`, variant: "success" });
            } catch (error) {
              await context.ui.dialog.alert({ title: "autocompact", message: String(error) });
            }
          },
        },
      ],
    }));
    return context.ui.slot({
      append: "prompt.footer.status",
      render: () => <text>auto:on</text>,
    });
  },
});
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS. Si `@opencode/plugin/tui` aún no resuelve fuera del TUI, registrar el error exacto y fijar el import según docs `/build/plugins/cli`.

- [ ] **Step 4: alta global por path**

Run: `python3 -c "import json; p='/home/dabi/.config/opencode/opencode.json'; d=json.load(open(p)); d.setdefault('plugins',[]); d['plugins'].append('/home/dabi/Proyectos/opencode-autocompact') if '/home/dabi/Proyectos/opencode-autocompact' not in d['plugins'] else None; json.dump(d,open(p,'w'),indent=2)"`
Expected: el archivo conserva `mcp` y suma `plugins`.

- [ ] **Step 5: verificación manual en TUI**

Run: abrir `opencode` y ejecutar `/autocompact`, `/autocompact off`, `/autocompact keep abc`.
Expected: toast de estado, toast success, dialog de error respectivamente; footer muestra `auto:on`.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/tui.tsx
git commit -m "feat: slash autocompact con footer y validacion"
```
