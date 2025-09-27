import { Sandbox } from "@e2b/code-interpreter";
import {
  createAgent,
  createTool,
  createNetwork,
  openai,
  gemini,
  type Tool,
  createState,
  Message,
} from "@inngest/agent-kit";
import { inngest } from "./client";
import {
  getSandbox,
  lastAssistantTextMessageContent,
  parseAgentOutput,
} from "@/inngest/utils";
import { z } from "zod";
import {
  PROMPT,
  WEBSITE_DESIGN_ENHANCEMENT_PROMPT,
  DECISION_PROMPT,
  FRAGMENT_TITLE_PROMPT,
  RESPONSE_PROMPT,
} from "@/prompt";
import prisma from "@/lib/db";
import { SANDBOX_TIMEOUT } from "@/types";
import { generateSlug } from "random-word-slugs";

interface AgentState {
  summary: string;
  files: { [path: string]: string };
  validated: boolean;
  sandboxId?: string;
  enhancedPrompt?: string;
  enhancementRetryCount: number;
  maxEnhancementRetries: number;
  needsEnhancement?: boolean;
  decisionMade: boolean;
  decisionError: boolean;
  hasHistory: boolean;
}

const MAX_ENHANCEMENT_RETRIES = 2;

// ---------------- Decision Agent ----------------
const decisionAgent = createAgent<AgentState>({
  name: "decision-agent",
  description:
    "Decides whether a request needs design enhancement or can go directly to coding",
  system: DECISION_PROMPT,
  model: gemini({
    model: "gemini-1.5-flash",
    defaultParameters: {},
  }),
  lifecycle: {
    onResponse: async ({ result, network }) => {
      try {
        const lastAssistantMessageText = lastAssistantTextMessageContent(result)
          ?.trim()
          .toUpperCase();
        if (network && lastAssistantMessageText) {
          if (lastAssistantMessageText === "ENHANCE") {
            network.state.data.needsEnhancement = true;
            network.state.data.validated = false; // Need to run enhancement
          } else if (lastAssistantMessageText === "CODE") {
            network.state.data.needsEnhancement = false;
            network.state.data.validated = true;
          }
          network.state.data.decisionMade = true;
          network.state.data.decisionError = false;
        }
        return result;
      } catch (error) {
        // Mimic onError behavior
        if (network) {
          network.state.data.decisionError = true;
          network.state.data.decisionMade = true;
          network.state.data.needsEnhancement = false;
          network.state.data.validated = true;
        }
        console.error("Decision agent error:", error);
        return result;
      }
    },
  },
});

// ---------------- Website Design Enhancement Agent ----------------
const websiteDesignEnhancementAgent = createAgent<AgentState>({
  name: "website-design-enhancer",
  description: "Enhances user prompts with professional UI/UX design expertise",
  system: WEBSITE_DESIGN_ENHANCEMENT_PROMPT,
  model: gemini({
    model: "gemini-1.5-flash",
    defaultParameters: {},
  }),
  lifecycle: {
    onResponse: async ({ result, network }) => {
      try {
        const lastAssistantMessageText =
          lastAssistantTextMessageContent(result);
        if (network && lastAssistantMessageText) {
          // Check if enhancement was successful (has meaningful content)
          if (
            lastAssistantMessageText.length > 50 &&
            lastAssistantMessageText.includes("-")
          ) {
            // Enhancement successful - store the enhanced prompt
            network.state.data.enhancedPrompt = lastAssistantMessageText;
            network.state.data.validated = true;
          } else {
            // Enhancement failed - check retry count
            if (
              network.state.data.enhancementRetryCount >=
              network.state.data.maxEnhancementRetries
            ) {
              // Max retries reached - skip to coding agent with original prompt
              network.state.data.validated = true;
              network.state.data.enhancedPrompt = undefined; // Use original prompt
            } else {
              // Retry enhancement
              network.state.data.enhancementRetryCount += 1;
              network.state.data.validated = false;
            }
          }
        }
        return result;
      } catch (error) {
        // Mimic onError behavior - if website design enhancement throws error, handle to coding agent
        if (network) {
          network.state.data.validated = true;
          network.state.data.enhancedPrompt = undefined; // Use original prompt
        }
        console.error("Website design enhancement agent error:", error);
        return result;
      }
    },
  },
});

// ---------------- Coding Agent ----------------
const codeAgent = createAgent<AgentState>({
  name: "code-agent",
  description:
    "An Exeprt coding agent that writes code in next.js, tailwind CSS, shadcn",
  system: PROMPT,
  model: openai({
    model: "gpt-4.1",
    defaultParameters: {},
  }),
  tools: [
    // terminal tool
    createTool({
      name: "terminal",
      description: "Use the terminal to run commands",
      parameters: z.object({ command: z.string() }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      handler: async ({ command }, { network }: Tool.Options<AgentState>) => {
        const buffer = { stdout: "", stderr: "" };
        try {
          const sandbox = await getSandbox(network.state.data.sandboxId!);
          const result = await sandbox.commands.run(command, {
            onStdout: (data: string) => {
              buffer.stdout += data;
            },
            onStderr: (data: string) => {
              buffer.stderr += data;
            },
          });
          return result.stdout;
        } catch (e) {
          console.error(
            `Command failed: ${e}\nstdout: ${buffer.stdout}\nstderr: ${buffer.stderr}`
          );
          return `Command failed: ${e}\nstdout: ${buffer.stdout}\nstderr: ${buffer.stderr}`;
        }
      },
    }),
    // createOrUpdateFiles tool
    createTool({
      name: "createOrUpdateFiles",
      description: "Create or update files in the sandbox",
      parameters: z.object({
        /* this is the output format*/
        files: z.array(
          z.object({
            path: z.string(),
            content: z.string(),
          })
        ),
      }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      handler: async ({ files }, { network }: Tool.Options<AgentState>) => {
        try {
          if (network) {
            const updateFiles = network.state.data.files || {};
            const sandbox = await getSandbox(network.state.data.sandboxId!);
            for (const file of files) {
              await sandbox.files.write(file.path, file.content);
              updateFiles[file.path] = file.content;
            }
            if (typeof updateFiles === "object") {
              network.state.data.files = updateFiles;
            }
          }
        } catch (error) {
          return "Error: " + error;
        }
      },
    }),
    // readFiles tool
    createTool({
      name: "readFiles",
      description: "Read files from the sandbox",
      parameters: z.object({
        files: z.array(z.string()),
      }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      handler: async ({ files }, { network }: Tool.Options<AgentState>) => {
        if (network) {
          const sandbox = await getSandbox(network.state.data.sandboxId!);
          const contents = [];
          for (const file of files) {
            const content = await sandbox.files.read(file);
            contents.push({ path: file, content });
          }
          return JSON.stringify(contents);
        }
      },
    }),
  ],
  lifecycle: {
    onResponse: async ({ result, network }) => {
      const lastAssistantMessageText = lastAssistantTextMessageContent(result);
      if (lastAssistantMessageText && network) {
        if (lastAssistantMessageText.includes("<task_summary>")) {
          network.state.data.summary = lastAssistantMessageText;
        }
      }
      return result;
    },
  },
});

// ---------------- Fragment Title Generator ----------------
const fragmentTitleGenerator = createAgent<AgentState>({
  name: "fragment-title-generator",
  description: "A fragment title generator",
  system: FRAGMENT_TITLE_PROMPT,
  model: gemini({
    model: "gemini-1.5-flash",
  }),
});

// ---------------- Response Generator ----------------
const responseGenerator = createAgent<AgentState>({
  name: "response-generator",
  description: "A response generator",
  system: RESPONSE_PROMPT,
  model: gemini({
    model: "gemini-1.5-flash",
  }),
});

export const codeAgentFunction = inngest.createFunction(
  { id: "create-website" },
  { event: "test/create.website" },
  async ({ event, step }) => {
    try {
      const sandboxId = await step.run("get-sandbox-id", async () => {
        const sandbox = await Sandbox.create("vibe-three");
        await sandbox.setTimeout(SANDBOX_TIMEOUT);
        return sandbox.sandboxId;
      });

      const previousMessages = await step.run(
        "get-previous-messages",
        async () => {
          const formattedMessages: Message[] = [];
          const messages = await prisma.message.findMany({
            where: {
              projectId: event.data.projectId,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 5,
          });
          for (const message of messages) {
            formattedMessages.push({
              type: "text",
              role: message.role === "ASSISTANT" ? "assistant" : "user",
              content: message.content,
            });
          }
          return formattedMessages;
        }
      );

      // Load existing files from previous fragment if available
      const existingFiles = await step.run("load-existing-files", async () => {
        const existingFragment = await prisma.fragment.findFirst({
          where: {
            message: {
              projectId: event.data.projectId,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (existingFragment?.files) {
          return existingFragment.files as { [path: string]: string };
        }
        return {};
      });

      const state = createState<AgentState>(
        {
          summary: "",
          files: existingFiles, // Load existing files instead of empty object
          validated: false,
          sandboxId,
          enhancedPrompt: undefined,
          enhancementRetryCount: 0,
          maxEnhancementRetries: MAX_ENHANCEMENT_RETRIES,
          needsEnhancement: undefined,
          decisionMade: false,
          decisionError: false,
          hasHistory: previousMessages.length > 1, // More than just the current user message
        },
        {
          messages: previousMessages.reverse(),
        }
      );

      const network = createNetwork<AgentState>({
        name: "website-builder-network",
        agents: [decisionAgent, websiteDesignEnhancementAgent, codeAgent],
        maxIter: 15,
        defaultState: state,
        router: async ({ network }) => {
          // First, make decision if not made yet
          if (!network.state.data.decisionMade) {
            return decisionAgent;
          }

          // If decision agent had an error, fallback to code agent
          if (network.state.data.decisionError) {
            network.state.data.validated = true;
            return codeAgent;
          }

          // If decision says we need enhancement and haven't exceeded retries
          if (
            network.state.data.needsEnhancement &&
            !network.state.data.validated &&
            network.state.data.enhancementRetryCount <
              network.state.data.maxEnhancementRetries
          ) {
            return websiteDesignEnhancementAgent;
          }

          // If validated (either enhanced or direct to coding) and no summary yet
          if (network.state.data.validated && !network.state.data.summary) {
            // Add enhanced prompt to the conversation before coding agent runs
            if (network.state.data.enhancedPrompt) {
              network.state.messages.push({
                type: "text",
                role: "user",
                content: `ENHANCED DESIGN REQUIREMENTS:\n${network.state.data.enhancedPrompt}\n\nPlease implement this enhanced design specification.`,
              });
            }

            // If we have existing files, add context about the current state
            if (Object.keys(network.state.data.files).length > 0) {
              network.state.messages.push({
                type: "text",
                role: "user",
                content: `CONTEXT: You are working on an existing project. The current files are already created and available in the sandbox. Please modify the existing code according to the user's request.`,
              });
            }

            return codeAgent;
          }
          return;
        },
      });

      const result = await network.run(event.data.value, { state });

      // Handle fragment title generator with error fallback
      let fragmentTitleOutput;
      try {
        const fragmentResult = await fragmentTitleGenerator.run(
          result.state.data.summary,
          { state }
        );
        fragmentTitleOutput = fragmentResult.output;
      } catch {
        // If fragment title generator shows error, use random slug like in project creation
        fragmentTitleOutput = generateSlug(2, {
          format: "title",
        });
      }

      // Handle response generator with error fallback
      let responseOutput;
      try {
        const responseResult = await responseGenerator.run(
          result.state.data.summary,
          { state }
        );
        responseOutput = responseResult.output;
      } catch {
        // If response generator throws error after retry, return success message
        responseOutput =
          "Great! Your query is ready. The code has been prepared and is ready to use.";
      }

      const isError =
        !result.state.data.summary ||
        Object.keys(result.state.data.files || {}).length === 0;

      const sandboxUrl = await step.run("get-sandbox-url", async () => {
        const sandbox = await getSandbox(sandboxId);
        const host = sandbox.getHost(3000);
        return `https://${host}`;
      });

      await step.run("save-result", async () => {
        if (isError) {
          return await prisma.message.create({
            data: {
              content: "Something went wrong. Please try again",
              role: "ASSISTANT",
              type: "ERROR",
              projectId: event.data.projectId,
            },
          });
        }
        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content:
              typeof responseOutput === "string"
                ? responseOutput
                : parseAgentOutput(responseOutput),
            role: "ASSISTANT",
            type: "RESULT",
            fragment: {
              create: {
                sandboxUrl,
                title:
                  typeof fragmentTitleOutput === "string"
                    ? fragmentTitleOutput
                    : parseAgentOutput(fragmentTitleOutput),
                files: result.state.data.files,
              },
            },
          },
        });
      });

      return {
        url: sandboxUrl,
        title:
          typeof fragmentTitleOutput === "string"
            ? fragmentTitleOutput
            : parseAgentOutput(fragmentTitleOutput),
        files: result.state.data.files,
        summary: result.state.data.summary,
      };
    } catch (error) {
      // If everything fails, save error message to database
      console.error("Complete function failure:", error);

      await step.run("save-error-message", async () => {
        return await prisma.message.create({
          data: {
            content: "Something went wrong. Please try again",
            role: "ASSISTANT",
            type: "ERROR",
            projectId: event.data.projectId,
          },
        });
      });

      // Return error response
      throw error;
    }
  }
);
