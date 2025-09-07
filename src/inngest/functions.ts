import { Sandbox } from "@e2b/code-interpreter";
import { gemini, createAgent } from "@inngest/agent-kit";
import { inngest } from "./client";
import { getSandbox } from "@/inngest/utils";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("vibe-three");
      return sandbox.sandboxId;
    });
    // create an agent
    const writer = createAgent({
      name: "writer",
      system:
        "You are an expert next.js developer.  You write readable, maintainable code. You write simple next js and React templates",
      model: gemini({ model: "gemini-1.5-flash" }),
    });
    const { output } = await writer.run(
      `Write the following snippet of code in next.js and React: ${event.data.value}`
    );

    console.log(output);

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    });

    return { output, sandboxUrl };
  }
);
