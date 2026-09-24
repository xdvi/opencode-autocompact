import { homedir } from "node:os";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin/tui";
import { createElement, insert } from "@opentui/solid";
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
import type { CompactionFile } from "./autocompact/config";
import { threshold } from "./autocompact/status";

function resolveConfig(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config", "opencode");
  return join(base, "opencode.json");
}

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT/.test(message)) return "config no encontrada: revisa XDG_CONFIG_HOME o ~/.config/opencode";
  if (/SyntaxError|JSON/.test(message)) return `config ilegible: ${message}`;
  return message;
}

function textLine(get: () => string): JSX.Element {
  const node = createElement("text");
  insert(node, get);
  return node as unknown as JSX.Element;
}

interface SeenLimit {
  limit: number;
}

export default Plugin.define({
  id: "autocompact.cli",
  setup(context) {
    const [state, setState] = context.storage.store("autocompact", { initial: { rev: 0 } });
    const [seen, setSeen] = context.storage.memory("autocompact-seen", { initial: { limit: 0 } as SeenLimit });

    const readCurrent = () => {
      const doc = readDoc(resolveConfig());
      return fromFile((doc.compaction ?? {}) as CompactionFile);
    };

    const limitFor = (sessionID?: string): number => {
      if (!sessionID) return 0;
      const session = context.data.session.get(sessionID);
      const ref = session?.model;
      if (!ref) return 0;
      const models = context.data.location.model.list(context.location) ?? [];
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

    const footerLine = (sessionID?: string): string => {
      state.rev;
      try {
        const current = readCurrent();
        const on = current.auto ? "on" : "off";
        if (sessionID) {
          const thresholdTokens = limitFor(sessionID);
          if (thresholdTokens > 0) return `auto:${on} @${formatCount(thresholdTokens)}`;
        }
        return `auto:${on} keep:${formatCount(current.keepTokens)} buffer:${formatCount(current.buffer)}`;
      } catch {
        return "auto:? (config ilegible)";
      }
    };

    const offApp = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "autocompact.run",
              title: "autocompact on|off|status|keep|buffer|target",
              slash: { name: "autocompact", arguments: true },
              run: async (input) => {
                let action;
                try {
                  action = parseArgs(input ?? "");
                } catch (error) {
                  await context.ui.dialog.alert({ title: "autocompact", message: friendly(error) });
                  return;
                }
                if (action.kind === "status") {
                  context.ui.toast.show({ message: footerLine() });
                  return;
                }
                try {
                  if (action.kind === "target") {
                    const limit = seen.limit;
                    if (limit <= 0) {
                      await context.ui.dialog.alert({
                        title: "autocompact",
                        message: "sin modelo detectado: abre una sesión primero",
                      });
                      return;
                    }
                    const buffer = bufferForTarget(limit, action.value);
                    const next = await persist(resolveConfig(), { buffer });
                    await setState((draft) => {
                      draft.rev += 1;
                    });
                    context.ui.toast.show({
                      message: `${formatCount(limit)} − ${formatCount(buffer)} = @${formatCount(action.value)}`,
                      variant: "success",
                    });
                    void next;
                    return;
                  }
                  const patch =
                    action.kind === "auto"
                      ? { auto: action.value }
                      : action.kind === "keep"
                        ? { keepTokens: action.value }
                        : { buffer: action.value };
                  const next = await persist(resolveConfig(), patch);
                  await setState((draft) => {
                    draft.rev += 1;
                  });
                  for (const warning of advise(next, {})) {
                    context.ui.toast.show({ message: warning, variant: "warning" });
                  }
                  context.ui.toast.show({
                    message: `autocompact actualizado auto:${next.auto ? "on" : "off"}`,
                    variant: "success",
                  });
                } catch (error) {
                  await context.ui.dialog.alert({ title: "autocompact", message: friendly(error) });
                }
              },
            },
          ],
        }));
        return textLine(() => "");
      },
    });
    const offFooter = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => textLine(() => footerLine(input.sessionID)),
    });
    return () => {
      offApp();
      offFooter();
    };
  },
});
