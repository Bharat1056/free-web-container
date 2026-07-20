import { SANDBOX_TIMEOUT } from "@/types";
import { Sandbox } from "@e2b/code-interpreter";
import { AgentResult, TextMessage } from "@inngest/agent-kit";

export async function getSandbox(sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.setTimeout(SANDBOX_TIMEOUT);
  return sandbox;
}

export function lastAssistantTextMessageContent(result: AgentResult) {
  const lastAssistantTextMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant"
  );

  const message = result.output[lastAssistantTextMessageIndex] as
    | TextMessage
    | undefined;

  let messaageContent: string | undefined;

  if (!message || message?.content === undefined) {
    return undefined;
  } else {
    messaageContent =
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.text).join("");
  }

  return messaageContent;
}

const MAX_FRAGMENT_TITLE_CHARS = 40;
const MAX_FRAGMENT_TITLE_WORDS = 5;

/**
 * Forces fragment card titles to stay short (max ~5 words / 40 chars).
 * Models sometimes return long prose; this keeps the preview chip readable.
 *
 * @param raw - Model or fallback title text
 * @returns A short title-case-ish label safe for the fragment card
 */
export function sanitizeFragmentTitle(raw: string | null | undefined): string {
  if (!raw?.trim()) return "Preview";

  const cleaned = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const firstLine = cleaned.split(/[.\n\r]/)[0]?.trim() || cleaned;
  const words = firstLine.split(" ").filter(Boolean).slice(0, MAX_FRAGMENT_TITLE_WORDS);
  let title = words.join(" ");

  if (title.length > MAX_FRAGMENT_TITLE_CHARS) {
    title = title.slice(0, MAX_FRAGMENT_TITLE_CHARS).trimEnd();
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > 12) title = title.slice(0, lastSpace);
  }

  return title || "Preview";
}
