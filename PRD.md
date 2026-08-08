# Product Requirements Document — Vibe

## Meta

| Field | Value |
|-------|--------|
| Product | Vibe |
| Version | 0.1.0 |
| Prepared for | TestSprite automated testing |
| Local app URL | http://localhost:3000 |
| App type | Full-stack web (Next.js) |

---

## 1. Product overview

Vibe is an AI-powered website builder. Authenticated users describe an application in natural language; the system validates the prompt, deducts a usage credit, and runs a background agent that scaffolds a Next.js + Tailwind + shadcn UI app inside an isolated E2B sandbox. Users watch live generation status, preview the sandbox in an iframe, inspect generated files, and iterate with follow-up chat messages. Free and Pro plans control monthly generation credits. In production mode, users must supply their own Gemini API key (BYOK). Payments use Razorpay.

---

## 2. Core goals

1. Let users turn a natural-language website idea into a runnable Next.js preview with minimal setup.
2. Support iterative refinement through a project chat that updates the same sandbox.
3. Gate expensive generation with prompt validation, usage credits, and optional BYOK.
4. Offer Free vs Pro plans via Razorpay checkout and coupons.
5. Keep unauthenticated users on marketing/auth/pricing surfaces only; protect workspace and settings.

---

## 3. Key features

### 3.1 Landing & project creation

- Public home page with hero prompt composer and optional templates.
- Signed-in users see their project list.
- Submitting a prompt creates a project (slug name), validates it is a web-build request, embeds the prompt, consumes one credit, and enqueues background generation.
- Prompt length constraints: 5–10,000 characters.
- Invalid / non-web-build prompts are rejected (`BAD_PROMPT`).

### 3.2 Authentication

- Google OAuth via Better Auth (sign-in / sign-up).
- Session cookie–based access.
- Public routes: `/`, `/sign-in`, `/sign-up`, `/pricing`, and selected API routes.
- Unauthenticated access to protected pages redirects to `/sign-in` with `callbackUrl`.

### 3.3 Project workspace

- Route: `/projects/[projectId]`.
- Chat message history with RESULT / ERROR / RETRY assistant messages.
- Generation status: `IDLE` | `GENERATING` | `FAILED` | `CANCELLED`.
- Demo pane: live sandbox preview iframe when a fragment URL exists.
- Code pane: file explorer for generated fragment files.
- Follow-up messages trigger edit-mode generation (same credit cost).
- Retry reuses the last user prompt without duplicating the USER message.

### 3.4 AI generation pipeline

- Orchestrated by Inngest (`test/create.website`).
- Modes: fresh create, edit (follow-up), continuation (retry with existing files).
- Agent tool loop (terminal, read/write files) inside E2B Next.js template; max ~15 iterations.
- On success: persist fragment files + sandbox URL + RESULT message.
- On failure/cancel: set status and surface RETRY assistant message.

### 3.5 Usage & billing

- Free plan: 2 generations per ~30-day window.
- Pro plan: 100 generations per ~30-day window.
- Pricing page shows plans; checkout via Razorpay; coupon codes can grant Pro.
- Usage status exposed to the UI (remaining points).

### 3.6 User settings (production / BYOK)

- Route: `/settings`.
- When `APP_MODE=prod`, users must set an encrypted Gemini API key before generation.
- Users can view status, set, or clear the Gemini key.

---

## 4. User flow summary

1. Visitor opens `/` and views landing content; may browse pricing.
2. User signs in or signs up with Google at `/sign-in` or `/sign-up`.
3. User enters a website-building prompt on home and submits.
4. System validates prompt, checks credits (and Gemini key in prod), creates project, redirects to `/projects/[id]`.
5. UI shows `GENERATING`; when complete, Demo and Code panes populate.
6. User sends follow-up prompts to refine the app, or retries after failure/cancel.
7. User may open `/pricing` to upgrade to Pro or apply a coupon.
8. In prod, user opens `/settings` to manage Gemini BYOK key.
9. User can return to `/` to list projects and start another.

---

## 5. Validation criteria (acceptance / test focus)

### Authentication & access

- [ ] Unauthenticated users can open `/`, `/sign-in`, `/sign-up`, `/pricing`.
- [ ] Unauthenticated users hitting `/projects/*` or `/settings` are redirected to sign-in.
- [ ] Google sign-in establishes a session and returns to `callbackUrl` when provided.
- [ ] Sign-out clears the session and blocks protected routes again.

### Project creation

- [ ] Empty / too-short / too-long prompts are rejected with clear validation errors.
- [ ] Non web-build prompts are rejected as bad prompts.
- [ ] Valid prompt creates a project and navigates to the project workspace.
- [ ] Creating a project when out of credits fails with a usage-limit error.

### Project workspace

- [ ] Project page loads chat history for the owner only (no cross-user access).
- [ ] While generating, status indicates generating; UI remains usable (no crash).
- [ ] Successful generation shows RESULT message and enables Demo/Code views when fragment data exists.
- [ ] Failed / cancelled generation shows recoverable messaging and allows retry.
- [ ] Follow-up message starts a new generation and appends to the thread.
- [ ] Retry does not duplicate the last user message.

### Billing & usage

- [ ] Usage status reflects remaining free/pro points after a generation attempt.
- [ ] Pricing page renders Free vs Pro and checkout entry points when configured.
- [ ] Invalid coupon is rejected; valid coupon upgrades plan (when coupon exists in DB).

### Settings (prod)

- [ ] Without Gemini key in prod mode, generation is blocked with a clear prompt to add a key.
- [ ] Setting a key updates status; clearing removes it.

### Smoke / stability

- [ ] `/api/health` returns a healthy response.
- [ ] Home and pricing render without console-breaking client errors for a signed-out visitor.
- [ ] Protected tRPC calls without a session fail with unauthorized (not 500).

---

## 6. Out of scope for UI E2E (prefer API / mocked / manual)

- Full end-to-end E2B sandbox success (requires E2B + Inngest + LLM keys and long runtime).
- Real Razorpay payment capture in sandbox without test keys.
- Real Google OAuth against production Google accounts in CI (use a prepared test account or mocked session when available).
- LLM prompt-validation edge cases that depend on live model responses (assert client/server error handling instead).

---

## 7. Code summary (for TestSprite)

### Tech stack

- TypeScript, Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/Radix
- tRPC 11, TanStack Query, Zod, SuperJSON
- Better Auth + Google OAuth
- PostgreSQL + Prisma
- Inngest (background jobs)
- E2B Code Interpreter (sandboxes)
- OpenAI / Gemini (LLM), Razorpay (billing)

### Feature → primary files

| Feature | Files |
|---------|--------|
| Landing / create form | `src/app/(home)/page.tsx`, `src/modules/home/ui/components/project-form.tsx` |
| Auth | `src/lib/auth.ts`, `src/app/(home)/sign-in/`, `src/app/(home)/sign-up/`, `src/middleware.ts` |
| Projects API | `src/modules/projects/server/procedures.ts` |
| Messages API | `src/modules/messages/server/procedures.ts` |
| Project UI | `src/modules/projects/ui/views/project-view.tsx` |
| Prompt validation | `src/modules/validation/server/validate-prompt.ts` |
| Generation | `src/inngest/functions.ts`, `src/inngest/code-tool-loop.ts` |
| Usage | `src/lib/usage.ts`, `src/modules/usage/server/procedure.ts` |
| Billing | `src/modules/billing/server/procedures.ts`, `src/app/(home)/pricing/page.tsx` |
| Settings / BYOK | `src/modules/user-settings/`, `src/app/(home)/settings/` |
| tRPC root | `src/trpc/routers/_app.ts` |

### Key routes

| Path | Auth | Purpose |
|------|------|---------|
| `/` | Public | Landing + create |
| `/sign-in` | Public | Sign in |
| `/sign-up` | Public | Sign up |
| `/pricing` | Public | Plans / upgrade |
| `/settings` | Protected | Gemini BYOK |
| `/projects/[projectId]` | Protected | Workspace |
| `/api/health` | Public | Health check |
| `/api/trpc/*` | Mixed | tRPC API |
| `/api/auth/*` | Public | Better Auth |

### Local test prerequisites

1. `npm run dev` — app on port **3000**.
2. `npm run inngest` — Inngest dev server (needed for real generation).
3. PostgreSQL with migrations applied; `.env` configured (no secrets in this PRD).
4. For auth E2E: a dedicated Google test account (or TestSprite login credentials configured in the MCP bootstrap portal).
5. Prefer frontend UI tests for auth, navigation, validation errors, and empty/loading states; treat full AI generation as high-cost optional coverage.

---

## 8. Suggested TestSprite test priorities

| Priority | Area | Why |
|----------|------|-----|
| High | Public landing + pricing render | Smoke |
| High | Auth gate on `/projects/*` and `/settings` | Security |
| High | Sign-in / sign-up pages usable | Core funnel |
| High | Prompt validation errors on create | Core product guardrail |
| High | Credit exhaustion error messaging | Billing correctness |
| Medium | Project workspace layout (chat / demo / code) | Main UX |
| Medium | Retry / follow-up UI affordances after failure | Reliability UX |
| Medium | Settings Gemini key flows (when prod) | Prod gate |
| Low | Full sandbox generation success | Slow, flaky, env-heavy |
| Low | Razorpay happy-path payment | Needs payment sandbox |
