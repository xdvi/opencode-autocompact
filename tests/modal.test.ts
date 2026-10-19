import { describe, expect, it, vi } from "vitest";
import { createModalState, renderModal } from "../src/autocompact/modal";

describe("createModalState", () => {
  it("initializes percent and auto from current configuration", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const toast = vi.fn();

    const state = createModalState({
      modelName: "llama-3.3-70b",
      contextLimit: 128000,
      current: { auto: true, buffer: 25600, keepTokens: 15000 },
      theme: { text: { base: "#fff", muted: "#888" } },
      onSave,
      onClose,
      toast,
    });

    expect(state.percent()).toBe(80);
    expect(state.isAuto()).toBe(true);
    expect(state.targetTokens()).toBe(102400);
    expect(state.bufferTokens()).toBe(25600);
    expect(state.progressBar()).toContain("█");
  });

  it("handles left and right arrow keys (step ±5%)", () => {
    const state = createModalState({
      modelName: "llama-3.3-70b",
      contextLimit: 128000,
      current: { auto: true, buffer: 25600, keepTokens: 15000 },
      theme: { text: { base: "#fff", muted: "#888" } },
      onSave: vi.fn(),
      onClose: vi.fn(),
      toast: vi.fn(),
    });

    state.handleKey("left");
    expect(state.percent()).toBe(75);
    expect(state.isAuto()).toBe(false);

    state.handleKey("right");
    expect(state.percent()).toBe(80);
    expect(state.isAuto()).toBe(false);
  });

  it("handles A key to reset to auto threshold", () => {
    const state = createModalState({
      modelName: "llama-3.3-70b",
      contextLimit: 128000,
      current: { auto: false, buffer: 10000, keepTokens: 15000 },
      theme: { text: { base: "#fff", muted: "#888" } },
      onSave: vi.fn(),
      onClose: vi.fn(),
      toast: vi.fn(),
    });

    state.handleKey("a");
    expect(state.isAuto()).toBe(true);
    expect(state.percent()).toBe(85); // 128k - 19.2k autoBuffer = 108.8k (~85%)
  });

  it("handles return key to save and close", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const toast = vi.fn();

    const state = createModalState({
      modelName: "llama-3.3-70b",
      contextLimit: 128000,
      current: { auto: false, buffer: 25600, keepTokens: 15000 },
      theme: { text: { base: "#fff", muted: "#888" } },
      onSave,
      onClose,
      toast,
    });

    state.handleKey("left"); // 75%
    await state.handleKey("return");

    expect(onSave).toHaveBeenCalledWith({
      auto: false,
      buffer: 32000, // 128000 - 96000 (75%)
    });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("75%"), "success");
    expect(onClose).toHaveBeenCalled();
  });

  it("handles escape key to close without saving", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    const state = createModalState({
      modelName: "llama-3.3-70b",
      contextLimit: 128000,
      current: { auto: true, buffer: 25600, keepTokens: 15000 },
      theme: { text: { base: "#fff", muted: "#888" } },
      onSave,
      onClose,
      toast: vi.fn(),
    });

    await state.handleKey("escape");
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("renders modal structure with populated title and text content", () => {
    const mockRenderer = {
      requestRender: vi.fn(),
      widthMethod: 0,
      keyInput: { on: vi.fn(), off: vi.fn() },
      registerLifecyclePass: vi.fn(),
      unregisterLifecyclePass: vi.fn(),
    };

    const modal = renderModal({
      renderer: mockRenderer,
      modelName: "llama-3.3-70b",
      contextLimit: 128000,
      current: { auto: true, buffer: 25600, keepTokens: 15000 },
      theme: { text: { base: "#fff", muted: "#888" } },
      onSave: vi.fn(),
      onClose: vi.fn(),
      toast: vi.fn(),
    });

    expect(modal).toBeDefined();

    const boxFn = typeof modal === "function" ? (modal as any)() : (modal as any).children;
    const box = typeof boxFn === "function" ? boxFn() : boxFn;
    expect(box.title).toBe("Auto-compact target");

    const children = box.getChildren();
    expect(children.length).toBe(10);

    const textAt = (index: number) => {
      const child = children[index];
      return child?.content?.chunks?.map((c: any) => c.text).join("") ?? "";
    };

    expect(textAt(0)).toContain("Model: llama-3.3-70b");
    expect(textAt(2)).toContain("Target threshold:  80%");
    expect(textAt(4)).toContain("[◀]");
    expect(textAt(6)).toContain("Free margin (buffer):");
    expect(textAt(7)).toContain("Retained context:");
    expect(textAt(9)).toContain("[Enter] Apply");
  });
});
