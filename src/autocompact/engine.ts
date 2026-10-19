export const REQUIRED_SECTIONS = [
  "## Objective",
  "## Requirements",
  "## Decisions",
  "## Work State",
  "### Completed",
  "### Active",
  "### Blocked",
  "## Next Move",
  "## Relevant Files",
  "## Important Context",
] as const;

export interface SimplifiedMessage {
  role: string;
  content: string;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    return typeof content === "object" && content !== null ? JSON.stringify(content) : String(content ?? "");
  }

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") {
      parts.push(String(part ?? ""));
      continue;
    }
    const item = part as Record<string, unknown>;
    if (item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item.type === "media") {
      const filename = typeof item.filename === "string" ? item.filename : "attachment";
      parts.push(`[Media: ${filename}]`);
    } else if (item.type === "tool_call" || item.type === "tool_use") {
      const name = item.name ?? item.tool ?? "tool";
      const inputStr = JSON.stringify(item.input ?? item.arguments ?? {});
      parts.push(`[Tool call: ${name}(${inputStr})]`);
    } else if (item.type === "tool_result") {
      const name = item.name ?? item.tool ?? "tool";
      const val = typeof item.value === "string" ? item.value : JSON.stringify(item.value ?? item.content ?? "");
      parts.push(`[Tool result: ${name}]: ${val}`);
    } else {
      parts.push(JSON.stringify(item));
    }
  }
  return parts.join("\n");
}

export function truncateToolOutputs(
  messages: Array<{ role?: string; type?: string; content: unknown }>,
  maxCharsPerOutput = 2000,
): SimplifiedMessage[] {
  return messages.map((m) => {
    const role = m.role ?? m.type ?? "user";
    let text = stringifyContent(m.content);

    if (role === "tool" || role === "tool_result" || text.startsWith("[Tool result:")) {
      if (text.length > maxCharsPerOutput) {
        text = text.slice(0, maxCharsPerOutput) + "\n[...truncated to save context...]";
      }
    }
    return { role, content: text };
  });
}

export function sliceMessagesForModel(
  messages: SimplifiedMessage[],
  maxTokens: number,
): SimplifiedMessage[] {
  if (messages.length <= 2) return messages;

  const totalTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  if (totalTokens <= maxTokens) return messages;

  const first = messages[0];
  const firstTokens = estimateTokens(first.content);
  const remainingBudget = Math.max(100, maxTokens - firstTokens - 50);

  const keptTrailing: SimplifiedMessage[] = [];
  let trailingTokens = 0;

  for (let i = messages.length - 1; i >= 1; i--) {
    const msg = messages[i];
    const cost = estimateTokens(msg.content);
    if (trailingTokens + cost > remainingBudget && keptTrailing.length > 0) {
      break;
    }
    keptTrailing.unshift(msg);
    trailingTokens += cost;
  }

  const omittedCount = messages.length - 1 - keptTrailing.length;
  if (omittedCount <= 0) {
    return messages;
  }

  const marker: SimplifiedMessage = {
    role: "system",
    content: `[...${omittedCount} earlier messages omitted for context brevity...]`,
  };

  return [first, marker, ...keptTrailing];
}

export function buildSummarizationPrompt(
  messages: SimplifiedMessage[],
  customInstructions?: string,
): string {
  const renderedHistory = messages
    .map((m) => `[${m.role.toUpperCase()}]:\n${m.content}`)
    .join("\n\n---\n\n");

  const promptSections = [
    `You are an expert software architect performing context compaction.`,
    `Your task is to summarize the conversation history below into a structured checkpoint that allows another agent to seamlessly resume the work.`,
    `Do NOT call any tools. Respond with plain text only.`,
    `Rules:
- Preserve exact file paths, symbols, function names, error messages, and shell commands.
- Preserve all user requirements, preferences, constraints, and security instructions verbatim.
- Summarize problems encountered, solutions found, and choices made.
- Keep each section concise, using bullet points.`,
    `You MUST use this format for your response (do NOT omit the section headings):
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Requirements
- [constraints, preferences, requirements, and scope boundaries stated by the user, or "(none)"]

## Decisions
- [decisions already made and why, or "(none)"]

## Work State
### Completed
- [goals that have been completed; otherwise "(none)"]

### Active
- [goals currently being worked on; otherwise "(none)"]

### Blocked
- [anything blocking progress, and why; otherwise "(none)"]

## Next Move
1. [ordered list of next actions, or "(none)"]

## Relevant Files
- \`[file or directory path]\`: [brief reason it matters]

## Important Context
- [facts the next agent cannot continue without; or "(none)"]`,
  ];

  if (customInstructions && customInstructions.trim()) {
    promptSections.push(`Additional Instructions:\n${customInstructions.trim()}`);
  }

  promptSections.push(`Conversation History:\n\n${renderedHistory}`);

  return promptSections.join("\n\n");
}

const THINK_TAG_REGEX = /<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi;
const ANALYSIS_TAG_REGEX = /<analysis>[\s\S]*?<\/analysis>/gi;
const SUMMARY_TAG_REGEX = /<summary>([\s\S]*?)<\/summary>/i;
const TEMPLATE_TAG_REGEX = /<template>([\s\S]*?)<\/template>/i;

export function sanitizeSummary(rawOutput: string): string {
  let text = rawOutput.trim();

  // Strip thinking / analysis tags
  text = text.replace(THINK_TAG_REGEX, "").trim();
  text = text.replace(ANALYSIS_TAG_REGEX, "").trim();

  // Extract from summary or template tag if present
  const summaryMatch = SUMMARY_TAG_REGEX.exec(text);
  if (summaryMatch) {
    text = summaryMatch[1].trim();
  } else {
    const templateMatch = TEMPLATE_TAG_REGEX.exec(text);
    if (templateMatch) {
      text = templateMatch[1].trim();
    }
  }

  // Ensure all required sections exist
  const missingSections: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!text.includes(section)) {
      missingSections.push(section);
    }
  }

  if (missingSections.length > 0) {
    const fallbackAdditions: string[] = [];
    for (const section of missingSections) {
      if (section === "### Completed" || section === "### Active" || section === "### Blocked") {
        fallbackAdditions.push(`${section}\n- (none)`);
      } else if (section === "## Next Move") {
        fallbackAdditions.push(`${section}\n1. (none)`);
      } else if (section === "## Work State") {
        fallbackAdditions.push(section);
      } else {
        fallbackAdditions.push(`${section}\n- (none)`);
      }
    }
    text = `${text}\n\n${fallbackAdditions.join("\n\n")}`.trim();
  }

  return text;
}
