import { homedir } from "node:os";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin/tui";
import { createElement, insert, setProp } from "@opentui/solid";
import type { JSX } from "@opentui/solid";
import {
  advise,
  bufferForTarget,
  formatCount,
  fromFile,
  persist,
  parseArgs,
  readDoc,
} from "./autocompact/config";
import type { CompactionConfig, CompactionFile, ConfigAction } from "./autocompact/config";
import { threshold, autoBuffer, bufferForPercent, renderProgressBar } from "./autocompact/status";

function resolveConfig(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config", "opencode");
  return join(base, "opencode.json");
}

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT/.test(message)) return "config not found: check XDG_CONFIG_HOME or ~/.config/opencode";
  if (/SyntaxError|JSON/.test(message)) return `unreadable config: ${message}`;
  return message;
}

function textLine(get: () => string): JSX.Element {
  const node = createElement("text");
  insert(node, get);
  return node as unknown as JSX.Element;
}

function footerPill(muted: string, base: string, label: string, value: string): JSX.Element {
  const box = createElement("box");
  setProp(box, "flexDirection", "row");
  const left = createElement("text");
  setProp(left, "fg", muted);
  insert(left, label);
  const right = createElement("text");
  setProp(right, "fg", base);
  insert(right, value);
  insert(box, left);
  insert(box, right);
  return box as unknown as JSX.Element;
}

interface SeenLimit {
  limit: number;
}

export interface ActionContext {
  getLimit: () => number;
  readCurrent: () => CompactionConfig;
  savePatch: (patch: Partial<CompactionConfig>) => Promise<CompactionConfig>;
  toast: (message: string, variant?: "info" | "success" | "warning" | "error") => void;
  alert: (message: string) => Promise<void>;
}

export type ActionHandler<K extends ConfigAction["kind"]> = (
  action: Extract<ConfigAction, { kind: K }>,
  ctx: ActionContext,
) => Promise<void>;

export const ACTION_HANDLERS: { [K in ConfigAction["kind"]]: ActionHandler<K> } = {
  status: async (_action, ctx) => {
    const current = ctx.readCurrent();
    const limit = ctx.getLimit();
    const detail =
      limit > 0
        ? `${formatCount(limit)} − ${formatCount(current.buffer)} = @${formatCount(limit - current.buffer)}`
        : `keep:${formatCount(current.keepTokens)} buffer:${formatCount(current.buffer)}`;
    ctx.toast(`auto:${current.auto ? "on" : "off"}\n${detail}`);
  },

  target: async (action, ctx) => {
    const limit = ctx.getLimit();
    if (limit <= 0) {
      await ctx.alert("no model detected: open a session first");
      return;
    }
    const buffer = bufferForTarget(limit, action.value);
    await ctx.savePatch({ buffer });
    ctx.toast(`${formatCount(limit)} − ${formatCount(buffer)} = @${formatCount(action.value)}`, "success");
  },

  percent: async (action, ctx) => {
    const limit = ctx.getLimit();
    if (limit <= 0) {
      await ctx.alert("no model detected: open a session first");
      return;
    }
    const buffer = bufferForPercent(limit, action.value);
    await ctx.savePatch({ buffer });
    ctx.toast(
      `${formatCount(limit)} − ${formatCount(buffer)} = ${action.value}% (@${formatCount(limit - buffer)})`,
      "success",
    );
  },

  auto: async (action, ctx) => {
    const patch: Partial<CompactionConfig> = { auto: action.value };
    if (action.value) {
      const limit = ctx.getLimit();
      if (limit > 0) {
        patch.buffer = autoBuffer(limit);
      }
    }
    const next = await ctx.savePatch(patch);
    const bufferNote = patch.buffer ? ` buffer:${formatCount(patch.buffer)}` : "";
    ctx.toast(`autocompact updated auto:${next.auto ? "on" : "off"}${bufferNote}`, "success");
  },

  keep: async (action, ctx) => {
    const next = await ctx.savePatch({ keepTokens: action.value });
    ctx.toast(`autocompact updated auto:${next.auto ? "on" : "off"}`, "success");
  },

  buffer: async (action, ctx) => {
    const next = await ctx.savePatch({ buffer: action.value });
    ctx.toast(`autocompact updated auto:${next.auto ? "on" : "off"} buffer:${formatCount(action.value)}`, "success");
  },
};

export default Plugin.define({
  id: "autocompact.cli",
  setup(context) {
    const [state, setState] = context.storage.store("autocompact", { initial: { rev: 0 } });
    const [seen, setSeen] = context.storage.memory("autocompact-seen", { initial: { limit: 0 } as SeenLimit });

    const readCurrent = () => {
      const doc = readDoc(resolveConfig());
      return fromFile((doc.compaction ?? {}) as CompactionFile);
    };

    const syncTried = { sessions: new Set<string>(), models: false };

    const bumpRev = (): void => {
      void setState((draft) => {
        draft.rev += 1;
      });
    };

    const currentSessionID = (preferred?: string): string | undefined => {
      if (preferred && context.data.session.get(preferred)) return preferred;
      const all = context.data.session.list() ?? [];
      if (all.length === 0) return preferred;
      const ranked = [...all].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
      return ranked[0]?.id ?? preferred;
    };

    const limitFor = (sessionID?: string): number => {
      const sid = currentSessionID(sessionID);
      if (!sid) return 0;
      const session = context.data.session.get(sid);
      const ref = session?.model;
      if (!ref) {
        if (!syncTried.sessions.has(sid)) {
          syncTried.sessions.add(sid);
          void context.data.session.sync(sid).then(bumpRev).catch(() => {});
        }
        return 0;
      }
      const models = context.data.location.model.list(context.location) ?? [];
      if (models.length === 0 && !syncTried.models) {
        syncTried.models = true;
        void context.data.location.model.sync(context.location).then(bumpRev).catch(() => {});
      }
      const info = models.find((m) => m.providerID === ref.providerID && m.id === ref.id);
      const contextLimit = info?.limit.context ?? 0;
      if (contextLimit <= 0) return 0;
      const inputLimit = info?.limit.input ?? contextLimit;
      const current = readCurrent();
      setSeen((draft) => {
        draft.limit = contextLimit;
      });
      void state.rev;
      return threshold(inputLimit, contextLimit, info?.limit.output ?? 32000, current.buffer);
    };

    const tokensFor = (sessionID?: string): number => {
      const sid = currentSessionID(sessionID);
      if (!sid) return 0;
      try {
        const messages = context.data.session.message.list(sid) ?? [];
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg.type === "assistant" && "tokens" in msg && msg.tokens) {
            const input = msg.tokens.input ?? 0;
            const cacheRead = msg.tokens.cache?.read ?? 0;
            return input + cacheRead;
          }
        }
      } catch {
        // message list unavailable
      }
      const session = context.data.session.get(sid);
      return session?.tokens?.input ?? 0;
    };

    const footerLine = (sessionID?: string): string => {
      state.rev;
      try {
        const current = readCurrent();
        if (sessionID) {
          const thresholdTokens = limitFor(sessionID);
          if (thresholdTokens > 0) {
            const used = tokensFor(sessionID);
            const mode = current.auto ? "⚡auto" : "off";
            if (used > 0) {
              const limit = seen.limit > 0 ? seen.limit : thresholdTokens + current.buffer;
              const usedPct = Math.round((used / limit) * 100);
              const bar = renderProgressBar(used, thresholdTokens, 8);
              return `[${bar} ${usedPct}% @${formatCount(thresholdTokens)}] ${mode}`;
            }
            return `[@${formatCount(thresholdTokens)}] ${mode}`;
          }
        }
        return `keep:${formatCount(current.keepTokens)} buffer:${formatCount(current.buffer)}`;
      } catch {
        return "";
      }
    };

    const isOn = (): boolean => {
      try {
        return readCurrent().auto;
      } catch {
        return false;
      }
    };

    const ensureLimit = (): number => {
      if (seen.limit <= 0) limitFor(currentSessionID());
      return seen.limit;
    };

    const actionContext: ActionContext = {
      getLimit: ensureLimit,
      readCurrent,
      savePatch: async (patch) => {
        const next = await persist(resolveConfig(), patch);
        await setState((draft) => {
          draft.rev += 1;
        });
        for (const warning of advise(next, {})) {
          context.ui.toast.show({ message: warning, variant: "warning" });
        }
        return next;
      },
      toast: (message, variant) => {
        context.ui.toast.show({ message, variant });
      },
      alert: async (message) => {
        await context.ui.dialog.alert({ title: "autocompact", message });
      },
    };

    const runAction = async (raw?: string) => {
      try {
        const action = parseArgs(raw ?? "");
        const handler = ACTION_HANDLERS[action.kind] as ActionHandler<typeof action.kind>;
        await handler(action, actionContext);
      } catch (error) {
        await context.ui.dialog.alert({ title: "autocompact", message: friendly(error) });
      }
    };

    const COMMAND_SPECS = [
      { id: "autocompact.run", title: "autocompact on|off|status|reset|keep|buffer|target", slash: "autocompact", args: true, run: (raw?: string) => runAction(raw) },
      { id: "autocompact.on", title: "autocompact on", slash: "autocompact:on", run: () => runAction("on") },
      { id: "autocompact.off", title: "autocompact off", slash: "autocompact:off", run: () => runAction("off") },
      { id: "autocompact.reset", title: "autocompact reset", slash: "autocompact:reset", run: () => runAction("reset") },
      { id: "autocompact.status", title: "autocompact status", slash: "autocompact:status", run: () => runAction("status") },
      { id: "autocompact.target", title: "autocompact target <n|pct%>", slash: "autocompact:target", args: true, run: (raw?: string) => runAction(`target ${raw ?? ""}`) },
      { id: "autocompact.keep", title: "autocompact keep <n>", slash: "autocompact:keep", args: true, run: (raw?: string) => runAction(`keep ${raw ?? ""}`) },
      { id: "autocompact.buffer", title: "autocompact buffer <n>", slash: "autocompact:buffer", args: true, run: (raw?: string) => runAction(`buffer ${raw ?? ""}`) },
    ];

    const offApp = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: COMMAND_SPECS.map((spec) => ({
            id: spec.id,
            title: spec.title,
            slash: spec.args ? { name: spec.slash, arguments: true } : { name: spec.slash },
            run: spec.run,
          })),
        }));
        return textLine(() => "");
      },
    });
    const offFooter = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => {
        if (!input.sessionID || !isOn()) return textLine(() => "");
        const theme = context.theme;
        return footerPill(theme.text.muted, theme.text.base, "(autocompact ", `${footerLine(input.sessionID)})`);
      },
    });
    return () => {
      offApp();
      offFooter();
    };
  },
});
