import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  truncateToolOutputs,
  sliceMessagesForModel,
  buildSummarizationPrompt,
  sanitizeSummary,
  REQUIRED_SECTIONS,
} from "../src/autocompact/engine";

describe("estimateTokens", () => {
  it("estimates token count from text length", () => {
    const text = "Hello world, this is a test string.";
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(text.length);
  });

  it("handles empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("truncateToolOutputs", () => {
  it("preserves short messages and truncates huge content", () => {
    const shortMsg = { role: "user", content: "read file" };
    const hugeContent = "x".repeat(10000);
    const toolMsg = { role: "tool", content: hugeContent };

    const result = truncateToolOutputs([shortMsg, toolMsg], 1000);
    expect(result[0].content).toBe("read file");
    expect(result[1].content.length).toBeLessThan(2000);
    expect(result[1].content).toContain("[...truncated");
  });

  it("strips raw media base64/bytes while keeping media label", () => {
    const mediaMsg = {
      role: "user",
      content: [
        { type: "text", text: "look at image" },
        { type: "media", media: { source: { type: "base64", data: "long_base64_string" } }, filename: "chart.png" },
      ],
    };
    const result = truncateToolOutputs([mediaMsg]);
    const text = typeof result[0].content === "string" ? result[0].content : JSON.stringify(result[0].content);
    expect(text).toContain("[Media: chart.png]");
    expect(text).not.toContain("long_base64_string");
  });
});

describe("sliceMessagesForModel", () => {
  it("returns all messages if within budget", () => {
    const msgs = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const sliced = sliceMessagesForModel(msgs, 5000);
    expect(sliced).toHaveLength(2);
  });

  it("keeps opening turn and trailing turns when exceeding budget", () => {
    const msgs = [
      { role: "user", content: "Initial objective: build auth system" },
      { role: "assistant", content: "middle step 1 " + "a".repeat(1000) },
      { role: "user", content: "middle step 2 " + "b".repeat(1000) },
      { role: "assistant", content: "middle step 3 " + "c".repeat(1000) },
      { role: "user", content: "Latest prompt: finish login page" },
      { role: "assistant", content: "Latest response: login page done" },
    ];
    // small token budget: ~300 tokens (approx 1200 chars)
    const sliced = sliceMessagesForModel(msgs, 300);
    expect(sliced[0].content).toContain("Initial objective: build auth system");
    expect(sliced[sliced.length - 1].content).toContain("Latest response: login page done");
    // middle should contain omission marker
    const middle = sliced.find((m) => m.content.includes("omitted"));
    expect(middle).toBeDefined();
  });
});

describe("buildSummarizationPrompt", () => {
  it("includes Claude-code reverse-engineered rules and OpenCode sections", () => {
    const msgs = [{ role: "user", content: "implement oauth" }];
    const prompt = buildSummarizationPrompt(msgs, "custom note");

    expect(prompt).toContain("Do NOT call any tools");
    expect(prompt).toContain("Additional Instructions:\ncustom note");
    for (const section of REQUIRED_SECTIONS) {
      expect(prompt).toContain(section);
    }
  });
});

describe("sanitizeSummary", () => {
  it("strips thinking/reasoning blocks and extracts summary", () => {
    const raw = `<think>
Let's analyze what the user wants...
</think>
<summary>
## Objective
- implement auth

## Requirements
- secure

## Decisions
- use jwt

## Work State
### Completed
- schema
### Active
- endpoints
### Blocked
- (none)

## Next Move
1. test endpoints

## Relevant Files
- \`src/auth.ts\`: jwt implementation

## Important Context
- auth token expires in 1h
</summary>`;

    const clean = sanitizeSummary(raw);
    expect(clean).not.toContain("<think>");
    expect(clean).not.toContain("<summary>");
    expect(clean).toContain("## Objective\n- implement auth");
  });

  it("auto-injects missing required sections if model omitted them", () => {
    const partial = `## Objective
- refactor code

## Work State
### Completed
- step 1
`;
    const clean = sanitizeSummary(partial);
    for (const section of REQUIRED_SECTIONS) {
      expect(clean).toContain(section);
    }
  });
});
