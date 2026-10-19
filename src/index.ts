import { Plugin } from "@opencode/plugin";
import {
  buildSummarizationPrompt,
  sanitizeSummary,
  sliceMessagesForModel,
  truncateToolOutputs,
} from "./autocompact/engine";

export interface SessionCompactionResult {
  summary: string;
  providerState?: unknown;
  metadata?: Record<string, unknown>;
  tokens?: unknown;
}

export interface CompactionEvent {
  sessionID: string;
  model: { id: string; providerID: string; limit?: { context?: number } };
  messages: unknown[];
  system?: unknown[];
  options?: Record<string, unknown>;
  result?: SessionCompactionResult;
}


export default Plugin.define({
  id: "autocompact.server",
  setup(context) {
    if (!context.session?.hook) return;

    void context.session.hook("compaction", async (event: any) => {
      const compactionEvent = event as CompactionEvent;
      if (compactionEvent.result) return;

      try {
        const rawMessages = event.messages ?? [];
        if (rawMessages.length === 0) return;

        // 1. Truncate heavy tool outputs and media to preserve token budget
        const simplified = truncateToolOutputs(rawMessages as any);

        // 2. Compute safe token capacity for the active model
        // Default to 128k context if limit is not directly available
        const modelLimit = (event.model as any)?.limit?.context ?? 128000;
        const maxInputTokens = Math.max(3000, Math.floor(modelLimit * 0.65));

        // 3. Slice history using Claude Code ladder: preserve intent + recent, omit middle if too large
        const sliced = sliceMessagesForModel(simplified, maxInputTokens);

        // 4. Build reverse-engineered structured compaction prompt
        const prompt = buildSummarizationPrompt(sliced);

        // 5. Generate summary using the session's model runner or generate API
        let responseText = "";
        if (context.session?.generate) {
          const res = await context.session.generate({
            sessionID: event.sessionID,
            prompt,
          });
          responseText = res?.text ?? "";
        } else if (context.generate?.text) {
          const res = await context.generate.text({
            prompt,
            model: event.model as any,
          });
          responseText = res?.text ?? "";
        }

        if (!responseText.trim()) return;

        // 6. Sanitize model output (strip reasoning tokens, extract summary, ensure all OpenCode sections)
        const cleanSummary = sanitizeSummary(responseText);

        event.result = {
          summary: cleanSummary,
          metadata: {
            autocompactEngine: "claude-code-adapted",
            sourceModel: event.model?.id,
          },
        };
      } catch (err) {
        // Fallback to let OpenCode's native summarizer handle it if an unexpected error occurs
        console.error("[opencode-autocompact] compaction error:", err);
      }
    });
  },
});
