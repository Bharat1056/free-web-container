# Multi-Agent Website Builder System

## Overview

This application implements a sophisticated multi-agent system for automated website generation using AI agents that collaborate through a shared network and state management system. The system transforms user prompts into fully functional Next.js applications through intelligent routing, design enhancement, and code generation.

## Problem Statement

### Core Challenges Addressed

1. **Prompt Complexity Management**: Users often provide vague or incomplete website requirements that need professional design enhancement
2. **Code Generation Quality**: Ensuring generated code follows best practices, uses proper frameworks, and produces production-ready applications
3. **Workflow Optimization**: Determining whether requests need design enhancement or can proceed directly to coding
4. **State Persistence**: Maintaining context across multiple agent interactions and iterations
5. **Sandbox Management**: Providing isolated execution environments for safe code generation and testing

### Solution Architecture

The system employs a **six-agent architecture** with intelligent routing and shared state management to address these challenges systematically.

## Agent Architecture

### 1. Decision Agent

**Purpose**: Intelligent routing and workflow determination

**Model**: Gemini 1.5 Flash
**Primary Function**: Analyzes user requests to determine the optimal processing path

**Decision Logic**:

- **ENHANCE**: New website requests requiring design enhancement
- **CODE**: Modification requests that can proceed directly to coding

**State Management**:

```typescript
interface AgentState {
  decisionMade: boolean;
  needsEnhancement?: boolean;
  validated: boolean;
}
```

**Lifecycle Hook**:

```typescript
onResponse: async ({ result, network }) => {
  const decision = lastAssistantTextMessageContent(result)
    ?.trim()
    .toUpperCase();
  if (decision === "ENHANCE") {
    network.state.data.needsEnhancement = true;
    network.state.data.validated = false;
  } else if (decision === "CODE") {
    network.state.data.needsEnhancement = false;
    network.state.data.validated = true;
  }
  network.state.data.decisionMade = true;
};
```

### 2. Website Design Enhancement Agent

**Purpose**: Professional design specification generation

**Model**: Gemini 1.5 Flash
**Primary Function**: Transforms basic user requests into comprehensive, professional design specifications

**Enhancement Capabilities**:

- User experience optimization
- Visual hierarchy design
- Mobile-first responsive planning
- Accessibility considerations
- Performance optimization strategies
- Conversion-focused design patterns

**State Management**:

```typescript
interface AgentState {
  enhancedPrompt?: string;
  enhancementRetryCount: number;
  maxEnhancementRetries: number;
}
```

**Lifecycle Hook**:

```typescript
onResponse: async ({ result, network }) => {
  const lastAssistantMessageText = lastAssistantTextMessageContent(result);
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
        network.state.data.enhancedPrompt = undefined;
      } else {
        // Retry enhancement
        network.state.data.enhancementRetryCount += 1;
        network.state.data.validated = false;
      }
    }
  }
  return result;
};
```

**Retry Logic**: Maximum 2 enhancement attempts with exponential backoff

### 3. Coding Agent

**Purpose**: Production-ready code generation

**Model**: GPT-4.1
**Primary Function**: Implements complete Next.js applications with professional-grade code

**Lifecycle Hook**:

```typescript
onResponse: async ({ result, network }) => {
  const lastAssistantMessageText = lastAssistantTextMessageContent(result);
  if (lastAssistantMessageText && network) {
    if (lastAssistantMessageText.includes("<task_summary>")) {
      network.state.data.summary = lastAssistantMessageText;
    }
  }
  return result;
};
```

**Available Tools**:

#### Terminal Tool

```typescript
createTool({
  name: "terminal",
  description: "Use the terminal to run commands",
  parameters: z.object({ command: z.string() }),
  handler: async ({ command }, { network }) => {
    const sandbox = await getSandbox(network.state.data.sandboxId!);
    const result = await sandbox.commands.run(command);
    return result.stdout;
  },
});
```

#### File Management Tool

```typescript
createTool({
  name: "createOrUpdateFiles",
  description: "Create or update files in the sandbox",
  parameters: z.object({
    files: z.array(
      z.object({
        path: z.string(),
        content: z.string(),
      })
    ),
  }),
  handler: async ({ files }, { network }) => {
    const sandbox = await getSandbox(network.state.data.sandboxId!);
    for (const file of files) {
      await sandbox.files.write(file.path, file.content);
    }
  },
});
```

#### File Reading Tool

```typescript
createTool({
  name: "readFiles",
  description: "Read files from the sandbox",
  parameters: z.object({ files: z.array(z.string()) }),
  handler: async ({ files }, { network }) => {
    const sandbox = await getSandbox(network.state.data.sandboxId!);
    const contents = [];
    for (const file of files) {
      const content = await sandbox.files.read(file);
      contents.push({ path: file, content });
    }
    return JSON.stringify(contents);
  },
});
```

### 4. Fragment Title Generator

**Purpose**: Generate descriptive titles for code fragments

**Model**: Gemini 1.5 Flash
**Primary Function**: Creates short, descriptive titles for generated code fragments based on task summaries

**Implementation**:

```typescript
const fragmentTitleGenerator = createAgent<AgentState>({
  name: "fragment-title-generator",
  description: "A fragment title generator",
  system: FRAGMENT_TITLE_PROMPT,
  model: gemini({
    model: "gemini-1.5-flash",
  }),
});
```

**Title Generation Rules**:

- Maximum 3 words
- Title case format (e.g., "Landing Page", "Chat Widget")
- No punctuation, quotes, or prefixes
- Relevant to what was built or changed

### 5. Response Generator

**Purpose**: Generate user-friendly completion messages

**Model**: Gemini 1.5 Flash
**Primary Function**: Creates casual, friendly messages explaining what was built

**Implementation**:

```typescript
const responseGenerator = createAgent<AgentState>({
  name: "response-generator",
  description: "A response generator",
  system: RESPONSE_PROMPT,
  model: gemini({
    model: "gemini-1.5-flash",
  }),
});
```

**Response Characteristics**:

- 1 to 3 sentences
- Casual, friendly tone
- Describes what the app does or what was changed
- No code, tags, or metadata
- Plain text response only

### 6. Prompt Validation Agent

**Purpose**: Validate user prompts for website building suitability

**Model**: Groq GPT-OSS-20B
**Primary Function**: Determines if user prompts are suitable for website building tasks

**Implementation**:

```typescript
const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-20b",
  temperature: 0.4,
});

export async function validatePrompt(
  prompt: string
): Promise<ValidationResult> {
  const chain = promptTemplate.pipe(model).pipe(parser);
  const result = await chain.invoke({
    prompt: prompt,
    format_instructions: formatInstructions,
  });
  return result as ValidationResult;
}
```

**Validation Criteria**:

**VALID Prompts**:

- Building websites, web apps, or web applications
- Creating web pages, components, or UI elements
- Developing frontend/backend functionality
- Designing web interfaces or layouts
- Implementing web features or functionality
- Creating landing pages, portfolios, blogs, e-commerce sites
- Building web tools, dashboards, or admin panels
- Any request involving HTML, CSS, JavaScript, React, Next.js, or web technologies

**INVALID Prompts**:

- General questions (weather, time, personal questions)
- Non-web development tasks (mobile apps, desktop apps, games)
- Random text or meaningless content
- Questions about AI capabilities or system information
- Requests for information that doesn't involve building something
- Chat or conversation that's not about web development

## Network and State Management

### Network Architecture

The system uses **Inngest Agent Kit** to create a collaborative agent network:

```typescript
const network = createNetwork<AgentState>({
  name: "website-builder-network",
  agents: [decisionAgent, websiteDesignEnhancementAgent, codeAgent],
  maxIter: 15,
  defaultState: state,
  router: async ({ network }) => {
    // Intelligent routing logic
  },
});
```

**Note**: The Fragment Title Generator, Response Generator, and Prompt Validation Agent operate outside the main network as post-processing agents and validation gatekeepers respectively.

### State Management System

**Centralized State Interface**:

```typescript
interface AgentState {
  summary: string; // Task completion summary
  files: { [path: string]: string }; // Generated file contents
  validated: boolean; // Validation status
  sandboxId?: string; // E2B sandbox identifier
  enhancedPrompt?: string; // Design enhancement output
  enhancementRetryCount: number; // Retry tracking
  maxEnhancementRetries: number; // Retry limits
  needsEnhancement?: boolean; // Enhancement requirement
  decisionMade: boolean; // Decision completion status
}
```

**State Initialization**:

```typescript
const state = createState<AgentState>(
  {
    summary: "",
    files: {},
    validated: false,
    sandboxId,
    enhancedPrompt: undefined,
    enhancementRetryCount: 0,
    maxEnhancementRetries: MAX_ENHANCEMENT_RETRIES,
    needsEnhancement: undefined,
    decisionMade: false,
  },
  {
    messages: previousMessages, // Conversation history
  }
);
```

### Router Logic

The network router implements intelligent agent selection based on state:

```typescript
router: async ({ network }) => {
  // 1. Decision Phase
  if (!network.state.data.decisionMade) {
    return decisionAgent;
  }

  // 2. Enhancement Phase
  if (
    network.state.data.needsEnhancement &&
    !network.state.data.validated &&
    network.state.data.enhancementRetryCount <
      network.state.data.maxEnhancementRetries
  ) {
    return websiteDesignEnhancementAgent;
  }

  // 3. Coding Phase
  if (network.state.data.validated && !network.state.data.summary) {
    // Inject enhanced prompt if available
    if (network.state.data.enhancedPrompt) {
      network.state.messages.push({
        type: "text",
        role: "user",
        content: `ENHANCED DESIGN REQUIREMENTS:\n${network.state.data.enhancedPrompt}\n\nPlease implement this enhanced design specification.`,
      });
    }
    return codeAgent;
  }

  return; // Network completion
};
```

## Execution Flow

### 1. Request Processing

**Frontend Integration**:

```typescript
// User submits request via MessageForm
const onSubmit = async (values: z.infer<typeof formSchema>) => {
  await createMessage.mutateAsync({
    value: values.value,
    projectId,
  });
};
```

**Backend Processing**:

```typescript
// 1. Prompt Validation (Pre-processing)
const validation = await validatePrompt(input.value);
if (!validation.isValid) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "BAD_PROMPT",
  });
}

// 2. Create Project and Message
const createdProject = await prisma.project.create({
  data: {
    userId: ctx.auth.userId,
    name: generateSlug(2, { format: "kebab" }),
    messages: {
      create: {
        content: input.value,
        role: "USER",
        type: "RESULT",
      },
    },
  },
});

// 3. Trigger Agent Network Execution
await inngest.send({
  name: "test/create.website",
  data: {
    value: input.value,
    projectId: createdProject.id,
  },
});
```

### 2. Sandbox Environment

**E2B Integration**:

```typescript
const sandboxId = await step.run("get-sandbox-id", async () => {
  const sandbox = await Sandbox.create("vibe-three");
  await sandbox.setTimeout(SANDBOX_TIMEOUT);
  return sandbox.sandboxId;
});
```

**Sandbox Features**:

- Isolated Next.js 15.5.2 environment
- Pre-configured with Tailwind CSS and Shadcn UI
- Hot reload enabled on port 3000
- File system access via tools
- Terminal command execution
- Network isolation for security

### 3. Agent Execution

**Network Execution**:

```typescript
const result = await network.run(event.data.value, { state });
```

**Post-Processing**:

```typescript
// 1. Generate Fragment Title (Post-processing Agent)
const { output: fragmentTitleOutput } = await fragmentTitleGenerator.run(
  result.state.data.summary,
  { state }
);

// 2. Generate User Response (Post-processing Agent)
const { output: responseOutput } = await responseGenerator.run(
  result.state.data.summary,
  { state }
);

// 3. Create Sandbox URL for Preview
const sandboxUrl = await step.run("get-sandbox-url", async () => {
  const sandbox = await getSandbox(sandboxId);
  const host = sandbox.getHost(3000);
  return `https://${host}`;
});

// 4. Save Results to Database
await step.run("save-result", async () => {
  return await prisma.message.create({
    data: {
      projectId: event.data.projectId,
      content: parseAgentOutput(responseOutput),
      role: "ASSISTANT",
      type: "RESULT",
      fragment: {
        create: {
          sandboxUrl,
          title: parseAgentOutput(fragmentTitleOutput),
          files: result.state.data.files,
        },
      },
    },
  });
});
```

## Technical Implementation Details

### Dependencies

**Core Agent Framework**:

- `@inngest/agent-kit`: Multi-agent orchestration
- `@e2b/code-interpreter`: Sandboxed execution environment

**AI Models**:

- OpenAI GPT-4.1: Code generation
- Google Gemini 1.5 Flash: Decision making, design enhancement, fragment titles, and user responses
- Groq GPT-OSS-20B: Prompt validation

**Frontend Stack**:

- Next.js 15.5.2 with App Router
- React 19.1.0
- TypeScript
- Tailwind CSS
- Shadcn UI components

**Backend Infrastructure**:

- Inngest: Event-driven function execution
- tRPC: Type-safe API layer
- Prisma: Database ORM
- Clerk: Authentication
- LangChain: Prompt validation with structured output parsing

### Database Schema

**Project Management**:

```sql
model Project {
  id        String   @id @default(cuid())
  name      String
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages Message[]
  fragments Fragment[]
}

model Message {
  id        String   @id @default(cuid())
  content   String
  role      Role
  type      MessageType
  projectId String
  createdAt DateTime @default(now())

  project   Project @relation(fields: [projectId], references: [id])
  fragment  Fragment?
}

model Fragment {
  id         String   @id @default(cuid())
  title      String
  sandboxUrl String
  files      Json
  messageId  String   @unique
  createdAt  DateTime @default(now())

  message Message @relation(fields: [messageId], references: [id])
}
```

### Error Handling and Resilience

**Retry Mechanisms**:

- Enhancement retry with exponential backoff
- Sandbox timeout management
- Network iteration limits (max 15 iterations)

**Error Recovery**:

```typescript
const isError =
  !result.state.data.summary ||
  Object.keys(result.state.data.files || {}).length === 0;

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
```

## Usage Patterns

### New Website Creation

1. **Prompt Validation**: Validates "Create a landing page" as website-building request
2. **Decision Agent**: Routes to ENHANCE
3. **Enhancement Agent**: Generates professional design specification
4. **Coding Agent**: Implements complete Next.js application
5. **Fragment Title Generator**: Creates title like "Landing Page"
6. **Response Generator**: Creates user-friendly completion message
7. **Result**: Production-ready website with preview URL and descriptive metadata

### Website Modification

1. **Prompt Validation**: Validates "Add a contact form" as website-building request
2. **Decision Agent**: Routes to CODE
3. **Coding Agent**: Directly implements the requested feature
4. **Fragment Title Generator**: Creates title like "Contact Form"
5. **Response Generator**: Creates user-friendly completion message
6. **Result**: Updated website with new functionality and descriptive metadata

### Quality Assurance

- **Prompt Validation**: Ensures only website-building requests are processed
- **Automatic Code Validation**: Generated code follows best practices
- **File System Integrity Checks**: Verifies all files are properly created
- **Sandbox Environment Verification**: Isolated execution environment
- **Error State Detection and Recovery**: Comprehensive error handling
- **Retry Mechanisms**: Automatic retry for failed enhancements
- **State Persistence**: Maintains context across agent interactions

## Performance Characteristics

**Execution Time**: 30-120 seconds depending on complexity
**Concurrency**: Single-threaded agent execution with state synchronization
**Resource Usage**: Isolated sandbox environments prevent resource conflicts
**Scalability**: Event-driven architecture supports horizontal scaling

## Security Considerations

**Sandbox Isolation**: Complete network and filesystem isolation
**Input Validation**: Prompt validation prevents malicious requests
**Rate Limiting**: Usage-based throttling prevents abuse
**Authentication**: Clerk-based user authentication and authorization

---

_This six-agent system represents a sophisticated approach to automated website generation, combining AI-powered prompt validation, intelligent decision making, professional design enhancement, production-ready code generation, and user-friendly output formatting through intelligent agent collaboration and shared state management._
