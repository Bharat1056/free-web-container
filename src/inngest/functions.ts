import { gemini, createAgent } from "@inngest/agent-kit";
import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    // create an agent
    const writer = createAgent({
      name: "writer",
      system:
        "You are an expert writer.  You write readable, concise, simple content.",
      model: gemini({ model: "gemini-1.5-flash" }),
    });
    console.log("Writing a blog post about ", event.data.value);
    const { output } = await writer.run(
      `Write a blog post about ${event.data.value}`
    );
    console.log(output);
    return { output };
  }
);
