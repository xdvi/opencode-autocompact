import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@opentui/solid", () => ({
  RendererContext: { Provider: (props: any) => (typeof props.children === "function" ? props.children() : props.children) },
  createElement: vi.fn((tag: string) => ({ tag, props: {} as Record<string, any>, children: [] as any[] })),
  insert: vi.fn((parent: any, child: any) => {
    parent.children.push(typeof child === "function" ? child() : child);
  }),
  setProp: vi.fn((node: any, key: string, val: any) => {
    node.props[key] = val;
  }),
}));

import plugin from "../src/tui";

describe("autocompact.cli plugin", () => {
  let tempDir: string;
  let configPath: string;
  const originalEnv = process.env.XDG_CONFIG_HOME;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autocompact-tui-test-"));
    process.env.XDG_CONFIG_HOME = tempDir;
    configPath = join(tempDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        compaction: { auto: true, keep: { tokens: 15000 }, buffer: 20000 },
      }),
    );
  });

  afterEach(() => {
    process.env.XDG_CONFIG_HOME = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("has id autocompact.cli", () => {
    expect(plugin.id).toBe("autocompact.cli");
  });

  it("registers app and footer slots and global keymap commands", async () => {
    const registeredSlots: any[] = [];
    let registeredKeymapLayer: any = null;

    const mockContext: any = {
      storage: {
        store: vi.fn(() => [{ rev: 0 }, vi.fn()]),
        memory: vi.fn(() => [{ limit: 200000 }, vi.fn()]),
      },
      data: {
        session: {
          list: vi.fn(() => [{ id: "s-1", time: { updated: 100 }, model: { providerID: "anthropic", id: "claude-3-5-sonnet" } }]),
          get: vi.fn(() => ({ id: "s-1", time: { updated: 100 }, model: { providerID: "anthropic", id: "claude-3-5-sonnet" } })),
          sync: vi.fn(),
          message: {
            list: vi.fn(() => []),
          },
        },
        location: {
          model: {
            list: vi.fn(() => [
              { providerID: "anthropic", id: "claude-3-5-sonnet", limit: { context: 200000, input: 200000, output: 8000 } },
            ]),
            sync: vi.fn(),
          },
        },
      },
      ui: {
        slot: vi.fn((slotDef: any) => {
          registeredSlots.push(slotDef);
          if (slotDef.append === "app") {
            slotDef.render();
          }
          return vi.fn();
        }),
        dialog: {
          alert: vi.fn(),
        },
        toast: {
          show: vi.fn(),
        },
      },
      keymap: {
        layer: vi.fn((factory: any) => {
          registeredKeymapLayer = factory();
        }),
      },
      theme: {
        text: {
          muted: "#888",
          base: "#fff",
        },
      },
      location: {},
    };

    const cleanup = await plugin.setup(mockContext);
    expect(typeof cleanup).toBe("function");

    // Two slots registered: app and prompt.footer.status
    expect(mockContext.ui.slot).toHaveBeenCalledTimes(2);
    expect(registeredSlots.map((s) => s.append)).toContain("app");
    expect(registeredSlots.map((s) => s.append)).toContain("prompt.footer.status");

    // Keymap layer registered
    expect(registeredKeymapLayer).toBeDefined();
    expect(registeredKeymapLayer.commands).toBeDefined();
    const commandIds = registeredKeymapLayer.commands.map((c: any) => c.id);
    expect(commandIds).toContain("autocompact.run");
    expect(commandIds).toContain("autocompact.on");
    expect(commandIds).toContain("autocompact.off");
    expect(commandIds).toContain("autocompact.reset");
    expect(commandIds).toContain("autocompact.status");
    expect(commandIds).toContain("autocompact.target");
  });

  it("handles status, target, and percentage actions in English", async () => {
    let capturedLayer: any = null;
    const toastSpy = vi.fn();
    const alertSpy = vi.fn();

    const mockContext: any = {
      storage: {
        store: vi.fn(() => [{ rev: 0 }, vi.fn()]),
        memory: vi.fn(() => [{ limit: 200000 }, vi.fn()]),
      },
      data: {
        session: {
          list: vi.fn(() => [{ id: "s-1", time: { updated: 100 }, model: { providerID: "anthropic", id: "claude-3-5-sonnet" } }]),
          get: vi.fn(() => ({ id: "s-1", time: { updated: 100 }, model: { providerID: "anthropic", id: "claude-3-5-sonnet" } })),
          sync: vi.fn(),
          message: { list: vi.fn(() => []) },
        },
        location: {
          model: {
            list: vi.fn(() => [
              { providerID: "anthropic", id: "claude-3-5-sonnet", limit: { context: 200000, input: 200000, output: 8000 } },
            ]),
            sync: vi.fn(),
          },
        },
      },
      ui: {
        slot: vi.fn((slotDef: any) => {
          if (slotDef.append === "app") {
            slotDef.render();
          }
          return vi.fn();
        }),
        dialog: { alert: alertSpy, show: vi.fn(), set: vi.fn(), clear: vi.fn() },
        toast: { show: toastSpy },
      },
      keymap: {
        layer: vi.fn((factory: any) => {
          capturedLayer = factory();
        }),
      },
      theme: { text: { muted: "#888", base: "#fff" } },
      location: {},
    };

    await plugin.setup(mockContext);

    const runCmd = capturedLayer.commands.find((c: any) => c.id === "autocompact.run");
    expect(runCmd).toBeDefined();

    // 1. UI Modal via empty or ui
    await runCmd.run("");
    expect(mockContext.ui.dialog.show).toHaveBeenCalled();
    expect(mockContext.ui.dialog.set).toHaveBeenCalledWith({ size: "medium", centered: true });

    mockContext.ui.dialog.show.mockClear();
    await runCmd.run("ui");
    expect(mockContext.ui.dialog.show).toHaveBeenCalled();

    // 2. Status
    await runCmd.run("status");
    expect(toastSpy).toHaveBeenCalled();
    expect(toastSpy.mock.calls[0][0].message).toContain("auto:on");

    // 3. Percentage target
    toastSpy.mockClear();
    await runCmd.run("target 80%");
    expect(toastSpy).toHaveBeenCalled();
    expect(toastSpy.mock.calls[0][0].message).toContain("80%");
    expect(toastSpy.mock.calls[0][0].variant).toBe("success");

    // 4. Absolute target
    toastSpy.mockClear();
    await runCmd.run("target 150k");
    expect(toastSpy).toHaveBeenCalled();
    expect(toastSpy.mock.calls[0][0].message).toContain("@150k");

    // 5. Reset
    toastSpy.mockClear();
    await runCmd.run("reset");
    expect(toastSpy).toHaveBeenCalled();
    expect(toastSpy.mock.calls[0][0].message).toContain("autocompact updated auto:on");

    // 6. Invalid command syntax shows alert in English
    alertSpy.mockClear();
    await runCmd.run("invalid_arg 123 456");
    expect(alertSpy).toHaveBeenCalled();
    expect(alertSpy.mock.calls[0][0].message).toContain("usage:");
  });

  it("renders footer progress bar when tokens are used", async () => {
    let footerSlot: any = null;

    const mockContext: any = {
      storage: {
        store: vi.fn(() => [{ rev: 0 }, vi.fn()]),
        memory: vi.fn(() => [{ limit: 200000 }, vi.fn()]),
      },
      data: {
        session: {
          list: vi.fn(() => [{ id: "s-1", time: { updated: 100 }, model: { providerID: "anthropic", id: "claude-3-5-sonnet" } }]),
          get: vi.fn(() => ({
            id: "s-1",
            time: { updated: 100 },
            model: { providerID: "anthropic", id: "claude-3-5-sonnet" },
            tokens: { input: 100000 },
          })),
          sync: vi.fn(),
          message: {
            list: vi.fn(() => [
              {
                type: "assistant",
                tokens: { input: 100000, cache: { read: 0, write: 0 } },
              },
            ]),
          },
        },
        location: {
          model: {
            list: vi.fn(() => [
              { providerID: "anthropic", id: "claude-3-5-sonnet", limit: { context: 200000, input: 200000, output: 8000 } },
            ]),
            sync: vi.fn(),
          },
        },
      },
      ui: {
        slot: vi.fn((slotDef: any) => {
          if (slotDef.append === "prompt.footer.status") {
            footerSlot = slotDef;
          }
          return vi.fn();
        }),
        dialog: { alert: vi.fn() },
        toast: { show: vi.fn() },
      },
      keymap: { layer: vi.fn() },
      theme: { text: { muted: "#888", base: "#fff" } },
      location: {},
    };

    await plugin.setup(mockContext);
    expect(footerSlot).toBeDefined();

    const rendered = footerSlot.render({ sessionID: "s-1" });
    expect(rendered).toBeDefined();
    expect(rendered.tag).toBe("box");
    expect(rendered.children[0].children[0]).toBe("(autocompact ");
    // Contains progress bar unicode character and percentage
    expect(rendered.children[1].children[0]).toContain("█");
    expect(rendered.children[1].children[0]).toContain("%");
  });
});
