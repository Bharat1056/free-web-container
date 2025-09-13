import { SANDBOX_TIMEOUT } from "@/types";
import { Sandbox } from "@e2b/code-interpreter";
import { AgentResult, Message, TextMessage } from "@inngest/agent-kit";

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

export const parseAgentOutput = (value: Message[]): string => {
  const output = value[0];
  if (output.type !== "text") {
    return "Fragment";
  }

  if (Array.isArray(output.content)) {
    return output.content.map((part) => part.text).join("");
  }

  return output.content;
};
