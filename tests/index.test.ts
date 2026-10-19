import { describe, expect, it, vi } from "vitest";
import plugin from "../src/index";

describe("autocompact.server plugin", () => {
  it("has correct id", () => {
    expect(plugin.id).toBe("autocompact.server");
  });

  it("registers compaction hook during setup", async () => {
    let hookName = "";
    let hookCallback: any = null;

    const mockContext: any = {
      session: {
        hook: vi.fn(async (name: string, cb: any) => {
          hookName = name;
          hookCallback = cb;
          return { dispose: vi.fn() };
        }),
        generate: vi.fn(async () => ({
          text: `## Objective\n- Test objective\n\n## Requirements\n- Test req\n\n## Decisions\n- (none)\n\n## Work State\n### Completed\n- (none)\n### Active\n- (none)\n### Blocked\n- (none)\n\n## Next Move\n1. (none)\n\n## Relevant Files\n- (none)\n\n## Important Context\n- (none)`,
        })),
      },
      generate: {
        text: vi.fn(),
      },
    };

    await plugin.setup(mockContext);

    expect(mockContext.session.hook).toHaveBeenCalledWith("compaction", expect.any(Function));
    expect(hookName).toBe("compaction");
    expect(typeof hookCallback).toBe("function");

    // Test invoking the hook callback
    const event: any = {
      sessionID: "test-session",
      model: { id: "claude-3-5-sonnet", providerID: "anthropic" },
      messages: [
        { role: "user", content: "Build authentication" },
        { role: "assistant", content: "Working on it" },
      ],
      system: [],
      options: {},
    };

    await hookCallback(event);

    expect(event.result).toBeDefined();
    expect(event.result.summary).toContain("## Objective");
    expect(event.result.summary).toContain("Test objective");
  });

  it("handles model reasoning tags and normalizes missing sections", async () => {
    let hookCallback: any = null;

    const mockContext: any = {
      session: {
        hook: vi.fn(async (_name: string, cb: any) => {
          hookCallback = cb;
          return { dispose: vi.fn() };
        }),
        generate: vi.fn(async () => ({
          text: `<think>Reasoning process...</think>\n<summary>\n## Objective\n- Simple goal\n</summary>`,
        })),
      },
    };

    await plugin.setup(mockContext);

    const event: any = {
      sessionID: "test-session",
      model: { id: "deepseek-r1", providerID: "deepseek" },
      messages: [{ role: "user", content: "Do something" }],
      system: [],
      options: {},
    };

    await hookCallback(event);

    expect(event.result).toBeDefined();
    expect(event.result.summary).not.toContain("<think>");
    expect(event.result.summary).toContain("## Objective\n- Simple goal");
    // Auto-filled missing sections
    expect(event.result.summary).toContain("## Work State");
    expect(event.result.summary).toContain("## Next Move");
  });
});
