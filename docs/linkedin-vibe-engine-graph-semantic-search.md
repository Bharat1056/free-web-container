# Building Context That Scales: Graph + RAG in an AI Website Builder

*A technical deep dive into Vibe — how the generation engine, import graph, and semantic search work together to keep AI edits grounded as projects grow.*

---

## 1. The context problem nobody ships around

Ask an LLM to build a landing page and it often does fine. Ask it — five messages later — to “fix the navbar spacing and wire the contact form to the same theme tokens,” and things get harder.

Not because the model is weak. Because **context is the product**.

As a generated codebase grows, three failure modes show up fast:

1. **Chat amnesia** — earlier design decisions fall out of the window.
2. **Path hallucination** — the model invents files or edits the wrong ones.
3. **Blind edits** — it changes a component without pulling in the modules that import it.

Dumping the entire repo into every prompt does not scale. Pure vector search without structure misses “this file depends on that one.” A dedicated multi-agent swarm can hide the same problem behind more moving parts.

**Vibe** takes a different approach: a single, durable code-generation engine, backed by two retrieval layers — **message RAG** for conversation memory and a **code intelligence layer** that combines embeddings with an import graph stored in PostgreSQL.

This post walks through that stack end to end.

---

## 2. What Vibe is

Vibe is an AI-powered website builder. Users describe what they want in natural language; the system:

- Validates the request
- Runs code generation inside an isolated **E2B** sandbox
- Returns a live Next.js preview
- Supports iterative follow-up edits with versioned file snapshots (**fragments**)

Under the hood it is a full-stack Next.js app: tRPC API, Inngest workers, Better Auth, Prisma on PostgreSQL, OpenAI for coding, and Gemini for embeddings.

The product surface is simple — prompt, preview, iterate. The interesting engineering is how we keep those iterations *grounded*.

---



## 3. Architecture at a glance

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Next.js UI     │────▶│  tRPC + gates    │────▶│  Inngest worker     │
│  prompt / edit  │     │  validate/usage  │     │  create-website     │
└─────────────────┘     │  embed message   │     └──────────┬──────────┘
                        └──────────────────┘                │
                                                            ▼
                                               ┌────────────────────────┐
                                               │  Code tool loop        │
                                               │  OpenAI + tools        │
                                               └──────────┬─────────────┘
                          ┌───────────────────────────────┼───────────────┐
                          ▼                               ▼               ▼
               ┌──────────────────┐          ┌──────────────────┐  ┌────────────┐
               │  Message RAG     │          │  Code index      │  │  E2B       │
               │  recent + cosine │          │  chunks + graph  │  │  sandbox   │
               └──────────────────┘          └──────────────────┘  └────────────┘
```

Two context engines sit beside the coding loop:


| Layer                 | Job                                | Storage                  |
| --------------------- | ---------------------------------- | ------------------------ |
| **Message RAG**       | Keep the right chat turns in scope | `Message.embedding`      |
| **Code intelligence** | Find the right files and neighbors | `CodeChunk` + `CodeEdge` |


Everything else — sandbox lifecycle, billing, auth — supports that loop. The rest of this post focuses on the engine and those two retrieval systems.

---



## 4. The generation engine



### One loop, three tools

Vibe does **not** run a multi-agent network. Code generation is a single OpenAI chat-completion loop with function tools, executed inside durable Inngest steps:


| Tool                  | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `terminal`            | Shell commands (`npm install`, shadcn CLI, etc.) |
| `readFiles`           | Read sandbox files before editing                |
| `createOrUpdateFiles` | Write or replace files                           |


That choice is deliberate. One loop is easier to reason about, checkpoint, rate-limit, and recover. When a mid-stream limit hits, we can salvage partial file arguments, sleep, and continue — without coordinating a swarm.

### Fresh mode vs edit mode

- **Fresh mode** — new project. No prior files. The model builds from the prompt and sandbox template (Next.js 15, Tailwind, shadcn).
- **Edit mode** — follow-up message. The worker loads the latest active fragment files, prior chat via message RAG, and reuses the project’s E2B sandbox when possible. Current file contents are grounded so the model edits from truth, not memory.

The model finishes with a `<task_summary>...</task_summary>` block. That becomes the assistant message; a short fragment title is derived for the UI card.

### Durability and isolation

Generation runs as an Inngest function. Sandboxes persist per project (`sandboxId`) and can auto-pause. If a sandbox is recreated, fragment files are hydrated back in before coding resumes.

Resilience knobs that matter in practice:

- Cap on infer/tool iterations per run
- Model fallback when a primary model fails before producing output
- Mid-stream rate-limit salvage + continuation
- Structured `RETRY` assistant messages on hard failures

The engine writes code. **Retrieval decides what the engine is allowed to see.**

---



## 5. Connecting the graph — without a graph database product

When people hear “graph,” they often picture Neo4j or Memgraph. Vibe takes a more pragmatic route:

> We store a **code import graph in PostgreSQL**, modeled with Prisma, and query it as a first-class retrieval signal.



### Schema: chunks as content, edges as structure

```prisma
model CodeChunk {
  id          String
  projectId   String
  path        String
  startLine   Int
  endLine     Int
  content     String
  contentHash String
  embedding   Float[]  @default([])
  // unique on (projectId, path, startLine, endLine)
}

model CodeEdge {
  id        String
  projectId String
  fromPath  String
  toPath    String
  kind      String  @default("IMPORTS")
  // unique on (projectId, fromPath, toPath, kind)
}
```

- `CodeChunk` — AST-aware snippets of a project file, each with an embedding.
- `CodeEdge` — directed `IMPORTS` relationships between file paths.

This is a graph in the systems sense: nodes (files / chunks) and edges (imports). We did not need a separate graph engine for the hop depth we use today (primarily **1-hop expansion**).

### How edges get built

On reindex, Vibe:

1. Writes the current fragment file map to a temp directory
2. Runs **madge** to extract the dependency graph
3. Infers `@/` alias patterns from the project layout so Next-style imports resolve correctly
4. Replaces all `CodeEdge` rows for that project in a transaction

```text
navbar.tsx ──IMPORTS──▶ button.tsx
navbar.tsx ──IMPORTS──▶ utils/cn.ts
page.tsx   ──IMPORTS──▶ navbar.tsx
```

Why bother? Vector search alone might surface `navbar.tsx` for “fix the header.” The graph answers the follow-up: **what else must stay consistent?** — theme helpers, shared button primitives, the page that mounts the nav.

### Why Postgres instead of a dedicated graph DB


| Need                   | Our choice                                             |
| ---------------------- | ------------------------------------------------------ |
| Tenant isolation       | `projectId` on every row — same DB, same auth boundary |
| Shallow expansion      | 1-hop neighbors (capped) — SQL indexes are enough      |
| Operational simplicity | One database with Prisma migrations                    |
| Hybrid scoring         | Join chunks + edges in application code                |


If we later need deep multi-hop reasoning, community detection, or global graph analytics, a dedicated graph store becomes more attractive. For iterative web-app edits, **import edges + hybrid ranking** has been the highest leverage move.

---



## 6. Semantic search — embeddings where they pay off



### Embedding provider

Vibe embeds text with **Gemini** (`gemini-embedding-001`, with a fallback chain). Failures return an empty vector so message creation and retrieval never block on embedding outages. If `GEMINI_API_KEY` is missing, RAG degrades gracefully to recent-message / keyword fallbacks.

### Where vectors live


| Entity        | Field                 | Used for                |
| ------------- | --------------------- | ----------------------- |
| Chat messages | `Message.embedding`   | Conversation RAG        |
| Code snippets | `CodeChunk.embedding` | Semantic code retrieval |


Messages are embedded on write. Missing embeddings are **lazily backfilled** when building context — useful after provider outages or historical rows.

### Message RAG policy

For edit and continuation runs, chat history is trimmed intentionally:

1. Always keep the last **2** messages (anchors — immediate continuity)
2. From older messages, pull up to **4** by cosine similarity to the current prompt
3. Similarity threshold: **0.7**
4. Hard cap: **6** messages total

```text
[ older history ... ] ──semantic pick──▶ up to 4
[ last 2 turns ]      ──always keep──▶ anchors
                          ↓
                    ≤ 6 messages into the loop
```

That balance matters. Pure recency forgets the original brand brief. Pure similarity can drop the last clarification. Anchors + semantic recall keeps both.

---



## 7. Hybrid code retrieval — the core of the system

This is where the engine, graph, and semantic search meet.

### Chunking before embedding

Large files are not embedded whole. Vibe uses:

- **AST-aware splits** via web-tree-sitter / LlamaIndex `CodeSplitter` (max ~1500 chars per chunk)
- **Line-window fallback** (80 lines, 20-line overlap) when AST splitting is unavailable
- **Content hashing** so unchanged chunks skip re-embedding

Only then do we store vectors on `CodeChunk`.

### Scoring blend

For a user edit prompt, each candidate chunk gets:

1. **Keyword / path score** — exact path pins hard; basename hits score high; path-token overlap is capped
2. **Content token boost** — light boost when prompt tokens appear in the snippet
3. **Vector score** — cosine similarity vs the prompt embedding (floor ~0.35)
4. **Weighted fusion** — roughly **55% keyword / 45% vector**

Keyword weight stays slightly higher because edit prompts are often literal: “fix `navbar.tsx`,” “update `contact-form`.” Path pinning prevents a semantically close but wrong file from winning.

### 1-hop graph expansion

After ranking seed files/chunks:

1. Take top-ranked paths as seeds
2. Query `CodeEdge` where `fromPath` or `toPath` is in the seed set
3. Add neighbor paths (capped, e.g. 6 files)
4. Budget the final snippet set into the edit prompt

```text
Prompt: "tighten navbar spacing"

  Vector+keyword  →  components/navbar.tsx   (seed)
  Graph hop       →  components/ui/button.tsx
                  →  lib/utils.ts
                  →  app/page.tsx

  Budget (~48k chars total, ~12k per file) → inject highest-scoring snippets
```



### Fallback when the index is empty

On a first edit before reindex finishes, retrieval falls back to **filename / content keyword ranking** over the live fragment map. The coding loop never waits on a perfect index to be useful.

### Budgeting is part of retrieval

Retrieval without a budget is just ranking. Vibe fills an edit-context budget with highest-ranked snippets first, truncates oversized files, and lists omitted paths so the model knows what exists but was not inlined.

Small projects can still inline more aggressively. The index layer is what keeps larger codebases from blowing the window.

---



## 8. Runtime: one edit request, end to end

Walkthrough of a follow-up edit:

1. **User** sends “Make the hero CTA match the navbar primary button.”
2. **tRPC** authenticates, checks usage, validates the prompt, embeds the message, persists it, emits the Inngest event.
3. **Worker** loads the latest active fragment files and sandbox session.
4. **Message RAG** selects recent anchors + semantically related earlier turns (brand colors, prior CTA copy).
5. **Code retrieval** ranks chunks (keyword + vector), expands one hop through `IMPORTS`, budgets snippets.
6. **Tool loop** runs in edit mode with grounded context; tools read/write inside E2B.
7. **On success** — new fragment snapshot, older fragments disabled, sandbox preview URL updated, assistant `RESULT` saved (and embedded for future RAG).

New projects skip prior files and heavy retrieval; they still embed the opening message so later edits have semantic history from day one.

---



## 9. Design decisions and trade-offs



### Postgres graph edges vs a dedicated graph DB

**Chose Postgres.** Our queries are project-scoped, shallow, and joined with vector/keyword scoring in application code. One operational plane beats introducing another datastore early.

### Hybrid search vs pure vectors

**Chose hybrid.** Path-literal prompts dominate iterative coding. Pure embedding search is excellent for “the sticky header we discussed” and weaker for “edit `pricing-card.tsx`.” Fusion + hard pins covers both.

### Inline files vs retrieval

**Both.** Small/active fragment content can be inlined for ground truth. Retrieval becomes critical as the tree grows past a comfortable prompt budget. The same budget constants govern what the model sees.

### Graceful degradation without embeddings

**Required.** Missing Gemini keys or API failures must not stop generation. Empty embeddings → keyword / recency paths. The product stays usable; search gets smarter when embeddings are healthy.

### Single tool loop vs multi-agent

**Single loop.** Context quality beat agent choreography for this product. Better retrieval usually outperforms another planner agent arguing with a coder agent.

---



## 10. What this unlocks

For users, the stack shows up as quieter reliability:

- Follow-ups remember the brief without pasting the whole chat
- Edits land on the files they meant — and often their import neighbors
- Previews stay consistent across fragment versions because the sandbox is hydrated from real snapshots
- Large projects degrade into retrieval instead of “context overflow and hope”

For builders reading this: **generation is the visible engine; context is the moat.** Graphs give you structure. Embeddings give you meaning. Hybrid retrieval is how you spend a finite token budget on the right bits of both.

---



## 11. Try the demo

If you want to see this loop in action — prompt → grounded edit → live Next.js preview — try the **Vibe demo** and run a few iterative edits on the same project. Watch how a follow-up that mentions a component still stays consistent with shared UI and prior chat decisions.

That consistency is not magic. It is an import graph, a few carefully chosen similarity thresholds, and a coding engine that only sees what retrieval can justify.

---

*Built with Next.js, Prisma/PostgreSQL, Inngest, E2B, OpenAI, and Gemini embeddings.*

*Questions about the hybrid ranker, madge edge build, or message RAG policy? Happy to go deeper in the comments.*
