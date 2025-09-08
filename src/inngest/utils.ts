import { Sandbox } from "@e2b/code-interpreter";
import { AgentResult, TextMessage } from "@inngest/agent-kit";

export async function getSandbox(sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
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

  if(!message || message?.content === undefined) {
    return undefined;
  } else {
    messaageContent = typeof message.content === "string" ? message.content : message.content.map((part) => part.text).join("");
  }

  return messaageContent;
}
