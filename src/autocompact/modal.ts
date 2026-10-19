import { RendererContext, createElement, insert, setProp, useKeyboard } from "@opentui/solid";
import type { JSX } from "@opentui/solid";
import { createComponent, createRenderEffect, createSignal } from "solid-js";
import type { CompactionConfig } from "./config";
import { formatCount } from "./config";
import { autoBuffer, bufferForPercent, renderProgressBar } from "./status";

export interface ModalOptions {
  renderer?: unknown;
  modelName: string;
  contextLimit: number;
  current: CompactionConfig;
  theme: {
    text: { base: string; muted: string };
    border?: { base: string };
  };
  onSave: (patch: Partial<CompactionConfig>) => Promise<void>;
  onClose: () => void;
  toast: (message: string, variant?: "info" | "success" | "warning" | "error") => void;
}

export function createModalState(options: ModalOptions) {
  const initialPercent = Math.min(
    95,
    Math.max(
      10,
      options.contextLimit > 0
        ? Math.round(((options.contextLimit - options.current.buffer) / options.contextLimit) * 100)
        : 80,
    ),
  );

  const [percent, setPercent] = createSignal(initialPercent);
  const [isAuto, setIsAuto] = createSignal(options.current.auto);

  const targetTokens = () => Math.round((options.contextLimit * percent()) / 100);
  const bufferTokens = () => Math.max(0, options.contextLimit - targetTokens());
  const progressBar = () => renderProgressBar(percent(), 100, 20);

  const handleKey = async (name: string): Promise<void> => {
    const key = name.toLowerCase();
    if (key === "left") {
      setPercent((p) => Math.max(10, p - 5));
      setIsAuto(false);
    } else if (key === "right") {
      setPercent((p) => Math.min(95, p + 5));
      setIsAuto(false);
    } else if (key === "a") {
      const autoBuff = autoBuffer(options.contextLimit);
      const autoPct = Math.round(((options.contextLimit - autoBuff) / options.contextLimit) * 100);
      setPercent(autoPct);
      setIsAuto(true);
    } else if (key === "return") {
      const p = percent();
      const auto = isAuto();
      const buffer = auto ? autoBuffer(options.contextLimit) : bufferForPercent(options.contextLimit, p);
      await options.onSave({ auto, buffer });
      const target = options.contextLimit - buffer;
      options.toast(
        `autocompact target set to ${p}% (@${formatCount(target)})${auto ? " ⚡auto" : ""}`,
        "success",
      );
      options.onClose();
    } else if (key === "escape") {
      options.onClose();
    }
  };

  return {
    percent,
    isAuto,
    targetTokens,
    bufferTokens,
    progressBar,
    handleKey,
  };
}

function makeText(get: () => string, fg?: string): JSX.Element {
  const node = createElement("text");
  if (fg) setProp(node, "fg", fg);
  const initial = get();
  setProp(node, "content", initial);
  createRenderEffect(() => {
    setProp(node, "content", get());
  });
  return node as unknown as JSX.Element;
}

export function renderModal(options: ModalOptions): JSX.Element {
  const build = (): JSX.Element => {
    const state = createModalState(options);

    try {
      useKeyboard((key) => {
        void state.handleKey(key.name);
      });
    } catch {
      // When rendered outside full TUI environment (e.g. testing)
    }

    const muted = options.theme.text.muted;
    const base = options.theme.text.base;

    const box = createElement("box");
    setProp(box, "borderStyle", "rounded");
    setProp(box, "borderColor", options.theme.border?.base ?? muted);
    setProp(box, "flexDirection", "column");
    setProp(box, "paddingLeft", 2);
    setProp(box, "paddingRight", 2);
    setProp(box, "paddingTop", 1);
    setProp(box, "paddingBottom", 1);
    setProp(box, "width", 68);
    setProp(box, "title", "Auto-compact target");

    // Line 1: Header title
    insert(
      box,
      makeText(
        () => `Model: ${options.modelName} (Context: ${formatCount(options.contextLimit)})`,
        base,
      ),
    );

    // Line 2: Empty spacer
    insert(box, makeText(() => " "));

    // Line 3: Target threshold
    insert(
      box,
      makeText(
        () =>
          `Target threshold:  ${state.percent()}%  (${formatCount(state.targetTokens())} tokens)${state.isAuto() ? " ⚡auto" : ""}`,
        base,
      ),
    );

    // Line 4: Empty spacer
    insert(box, makeText(() => " "));

    // Line 5: Interactive Slider
    insert(
      box,
      makeText(
        () => `[◀]  [${state.progressBar()}]  ${state.percent()}%  [▶]  (Step: ±5%)`,
        base,
      ),
    );

    // Line 6: Empty spacer
    insert(box, makeText(() => " "));

    // Line 7: Buffer info
    insert(
      box,
      makeText(
        () => `Free margin (buffer):  ${formatCount(state.bufferTokens())} tokens`,
        muted,
      ),
    );

    // Line 8: Keep info
    insert(
      box,
      makeText(
        () => `Retained context:      ${formatCount(options.current.keepTokens)} tokens`,
        muted,
      ),
    );

    // Line 9: Empty spacer
    insert(box, makeText(() => " "));

    // Line 10: Shortcut buttons
    insert(
      box,
      makeText(
        () => `[Enter] Apply   [A] Reset to Auto   [Esc] Close`,
        muted,
      ),
    );

    return box as unknown as JSX.Element;
  };

  if (options.renderer) {
    return createComponent(RendererContext.Provider, {
      value: options.renderer as any,
      get children() {
        return build();
      },
    }) as unknown as JSX.Element;
  }

  return build();
}
