import { homedir } from "node:os";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin/tui";
import { createElement, insert } from "@opentui/solid";
import type { JSX } from "@opentui/solid";
import { advise, fromFile, persist, parseArgs, readDoc } from "./autocompact/config";
import type { CompactionFile } from "./autocompact/config";

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

export default Plugin.define({
  id: "autocompact.cli",
  setup(context) {
    const [state, setState] = context.storage.store("autocompact", { initial: { rev: 0 } });
    const statusLine = (): string => {
      state.rev;
      try {
        const doc = readDoc(resolveConfig());
        const current = fromFile((doc.compaction ?? {}) as CompactionFile);
        return `auto:${current.auto ? "on" : "off"} keep:${current.keepTokens} buffer:${current.buffer}`;
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
              title: "autocompact on|off|status|keep|buffer",
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
                  context.ui.toast.show({ message: statusLine() });
                  return;
                }
                const patch =
                  action.kind === "auto"
                    ? { auto: action.value }
                    : action.kind === "keep"
                      ? { keepTokens: action.value }
                      : { buffer: action.value };
                try {
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
      render: () => textLine(statusLine),
    });
    return () => {
      offApp();
      offFooter();
    };
  },
});
