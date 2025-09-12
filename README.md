# Heartifact - AI-Powered Web Development Platform

## 🎯 Our Mission

**Heartifact** is an innovative AI-powered web development platform that transforms natural language descriptions into fully functional web applications. We're building the future where anyone can create sophisticated web applications through conversational AI, eliminating the traditional barriers between ideas and implementation.

## 🚀 What We're Building

Heartifact is a comprehensive platform that combines:

- **AI Agent System**: Powered by GPT-4, our intelligent coding agent understands complex requirements and generates production-ready code
- **Sandboxed Development Environment**: Secure, isolated environments using E2B for safe code execution and testing
- **Real-time Collaboration**: Interactive chat interface for iterative development and refinement
- **Project Management**: Persistent storage of projects, messages, and code fragments for seamless development workflows

## 🔧 Current Architecture

### Core Components

- **Frontend**: Next.js 15.5.2 with TypeScript, Tailwind CSS, and Shadcn UI components
- **Backend**: tRPC for type-safe API communication, PostgreSQL with Prisma ORM
- **AI Agent**: Inngest-based agent system with GPT-4 integration
- **Sandbox**: E2B code interpreter for secure code execution
- **State Management**: TanStack Query for efficient data fetching and caching

### Key Features

- **Conversational Development**: Users describe what they want to build in natural language
- **Intelligent Code Generation**: AI agent creates complete, functional web applications
- **Live Preview**: Real-time preview of generated applications in sandboxed environments
- **Project Persistence**: All conversations and code fragments are saved for future reference
- **Fragment System**: Each AI response creates a "fragment" containing the generated code and preview

## 🎯 Problems We're Solving

### 1. **Agent Hallucination Challenge**

**Current Challenge**: AI agents often generate code that doesn't match user intent or contains errors.

**Our Approach**:

- Comprehensive system prompts with strict tool usage requirements
- Multi-step verification process with self-correction protocols
- Quality assurance checks that force the agent to read back and verify generated code
- Structured task completion with mandatory `<task_summary>` outputs

### 2. **Memory and Context Management**

**Current Challenge**: AI agents lose context between interactions, leading to inconsistent behavior.

**Our Solution**:

- Persistent message history with full conversation context
- Fragment-based memory system that stores both code and metadata
- Project-based organization that maintains context across sessions
- Future plans for advanced memory systems to improve agent consistency

### 3. **User Control and Editability**

**Current Challenge**: Users need the ability to edit and refine specific parts of generated projects.

**Our Vision**:

- Granular editing capabilities for specific code sections
- Visual code editor integration
- Selective regeneration of project components
- User-guided refinement workflows

## 🛠️ Technical Implementation

### Agent System Architecture

```typescript
// Core agent configuration
const codeAgent = createAgent<AgentState>({
  name: "code-agent",
  description:
    "An Expert coding agent that writes code in next.js, tailwind CSS, shadcn",
  system: PROMPT, // Comprehensive system prompt with strict guidelines
  model: openai({
    model: "gpt-4.1",
    defaultParameters: {},
  }),
  tools: [
    createTool("terminal"), // Command execution
    createTool("createOrUpdateFiles"), // File manipulation
    createTool("readFiles"), // File reading
  ],
  lifecycle: {
    onResponse: async ({ result, network }) => {
      // Quality assurance and summary extraction
    },
  },
});
```

### Data Models

```prisma
model Project {
  id        String    @id @default(cuid())
  name      String
  messages  Message[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Message {
  id        String      @id @default(cuid())
  content   String
  role      MessageRole // USER | ASSISTANT
  type      MessageType // RESULT | ERROR
  projectId String
  project   Project     @relation(fields: [projectId], references: [id])
  fragment  Fragment?
}

model Fragment {
  id         String   @id @default(cuid())
  messageId  String   @unique
  message    Message  @relation(fields: [messageId], references: [id])
  sandboxUrl String
  title      String
  files      Json     // Generated code files
}
```

## 🚧 Current Challenges & Solutions

### 1. **Minimizing Agent Hallucination**

**Problem**: AI agents sometimes generate incorrect or non-functional code.

**Current Solutions**:

- **Strict Tool Usage**: Agents must use specific tools for all operations
- **Verification Protocol**: Mandatory file reading after code generation
- **Quality Gates**: Task completion requires proper summary and file generation
- **Error Handling**: Comprehensive error catching and user feedback

**Future Improvements**:

- Enhanced prompt engineering with more specific constraints
- Multi-agent validation systems
- Automated testing integration
- User feedback loops for continuous improvement

### 2. **Memory and Context Persistence**

**Problem**: Agents lose context between interactions, affecting consistency.

**Current Implementation**:

- Full conversation history storage
- Project-based context management
- Fragment system for code persistence

**Future Enhancements**:

- Advanced memory systems with semantic search
- Context-aware agent responses
- Long-term memory for user preferences
- Cross-project learning capabilities

### 3. **User Editing Capabilities**

**Problem**: Users need granular control over generated code.

**Current State**:

- Basic fragment viewing and preview
- TODO: Preview panel implementation
- TODO: Active fragment management

**Planned Features**:

- Visual code editor integration
- Selective code regeneration
- User-guided refinement workflows
- Real-time collaboration features

## 🗺️ Roadmap

### Phase 1: Foundation (Current)

- ✅ Core agent system with GPT-4 integration
- ✅ Sandboxed development environment
- ✅ Basic project and message management
- ✅ Fragment system for code storage
- 🔄 Preview panel implementation
- 🔄 Active fragment management

### Phase 2: Enhanced User Experience

- **Visual Code Editor**: Integrated code editing capabilities
- **Selective Regeneration**: Edit specific parts of generated projects
- **Advanced Memory**: Context-aware agent responses
- **Real-time Collaboration**: Multi-user editing capabilities

### Phase 3: Advanced Features

- **Multi-Agent Systems**: Specialized agents for different tasks
- **Automated Testing**: Built-in testing and validation
- **Deployment Integration**: Direct deployment to various platforms
- **Template System**: Reusable project templates and patterns

### Phase 4: Platform Expansion

- **Multi-Framework Support**: React, Vue, Angular, etc.
- **Backend Integration**: Full-stack application generation
- **API Generation**: Automatic API creation and management
- **Database Integration**: Intelligent database schema generation

## 🛡️ Security & Safety

- **Sandboxed Execution**: All code runs in isolated E2B environments
- **No Direct File System Access**: Agents use controlled tools for file operations
- **Input Validation**: Comprehensive validation of user inputs and agent outputs
- **Error Isolation**: Failures in one project don't affect others

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- E2B API key
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd heartifact

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Configure your database and API keys

# Run database migrations
npx prisma migrate dev

# Start the development server
npm run dev
```

### Environment Variables

```env
DATABASE_URL="postgresql://..."
OPENAI_API_KEY="sk-..."
E2B_API_KEY="..."
INNGEST_EVENT_KEY="..."
INNGEST_SIGNING_KEY="..."
```

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines for details on:

- Code style and standards
- Testing requirements
- Pull request process
- Issue reporting

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **E2B** for providing secure sandboxed environments
- **Inngest** for robust agent orchestration
- **OpenAI** for powerful language models
- **Vercel** for excellent Next.js framework
- **Shadcn** for beautiful UI components

---

**Heartifact** - Where ideas become applications through the power of AI. 🚀

_Building the future of web development, one conversation at a time._
