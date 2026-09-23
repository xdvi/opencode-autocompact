import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin/tui";
import { DEFAULTS, fromFile, merge, parseArgs, toFile } from "./autocompact/config";
import type { CompactionFile } from "./autocompact/config";

const GLOBAL_CONFIG = join(homedir(), ".config", "opencode", "opencode.json");

async function persist(patch: { auto?: boolean; keepTokens?: number; buffer?: number }) {
  const raw = await readFile(GLOBAL_CONFIG, "utf8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const next = merge(fromFile((doc.compaction ?? {}) as CompactionFile), patch);
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
              context.ui.toast.show({
                message: `auto:${current.auto ? "on" : "off"} keep:${current.keepTokens} buffer:${current.buffer}`,
              });
              return;
            }
            const patch =
              action.kind === "auto"
                ? { auto: action.value }
                : action.kind === "keep"
                  ? { keepTokens: action.value }
                  : { buffer: action.value };
            try {
              const next = await persist(patch);
              context.ui.toast.show({
                message: `autocompact actualizado auto:${next.auto ? "on" : "off"}`,
                variant: "success",
              });
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
