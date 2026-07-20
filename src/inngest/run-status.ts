import type { GenerationStatus } from "@prisma/client";
import prisma from "@/lib/db";
import { GENERATION_STALE_MS } from "@/constants";

/** Inngest REST statuses we care about for generation reconcile. */
export type InngestRunStatus =
  | "Running"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Queued"
  | string;

/**
 * Base URL for the Inngest REST API.
 * Local Dev Server when `INNGEST_DEV` is set; Cloud otherwise.
 */
export function getInngestApiBase(): string {
  if (process.env.INNGEST_DEV) {
    return (
      process.env.INNGEST_BASE_URL?.replace(/\/$/, "") ||
      "http://localhost:8288"
    );
  }
  return "https://api.inngest.com";
}

/**
 * Fetches run statuses for an event via Inngest REST
 * `GET /v1/events/{eventId}/runs`.
 *
 * @param eventId - Event id returned by `inngest.send()`
 * @returns Run objects (may be empty when the event was never processed)
 */
export async function getInngestEventRuns(
  eventId: string
): Promise<Array<{ status?: InngestRunStatus; function_id?: string }>> {
  const base = getInngestApiBase();
  const headers: HeadersInit = { Accept: "application/json" };
  const signingKey = process.env.INNGEST_SIGNING_KEY?.trim();
  // Dev server usually does not require auth; Cloud does.
  if (signingKey && !process.env.INNGEST_DEV) {
    headers.Authorization = `Bearer ${signingKey}`;
  }

  const response = await fetch(`${base}/v1/events/${eventId}/runs`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(
      "Inngest run-status fetch failed:",
      response.status,
      await response.text().catch(() => "")
    );
    return [];
  }

  const json = (await response.json()) as {
    data?: Array<{ status?: InngestRunStatus; function_id?: string }>;
  };
  return json.data ?? [];
}

/**
 * Maps Inngest run status (or absent runs) to our GenerationStatus.
 * Prefers the most severe terminal status among runs for our function.
 */
export function mapRunsToGenerationStatus(
  runs: Array<{ status?: InngestRunStatus; function_id?: string }>
): GenerationStatus | "GENERATING" {
  const relevant = runs.filter(
    (r) => !r.function_id || r.function_id.includes("create-website")
  );
  const list = relevant.length > 0 ? relevant : runs;

  if (list.length === 0) {
    // Event never produced a run (dev server down, never delivered).
    return "FAILED";
  }

  const statuses = list.map((r) => (r.status || "").toLowerCase());
  if (statuses.some((s) => s === "failed")) return "FAILED";
  if (statuses.some((s) => s === "cancelled")) return "CANCELLED";
  if (statuses.every((s) => s === "completed")) return "IDLE";
  // Running / Queued / unknown in-progress
  return "GENERATING";
}

/** Whether a GENERATING project has been running long enough to be considered dead. */
function isGenerationStale(startedAt: Date | null): boolean {
  if (!startedAt) return true;
  return Date.now() - startedAt.getTime() > GENERATION_STALE_MS;
}

/**
 * Applies a terminal status to a still-GENERATING project. Uses a guarded
 * update so concurrent polls don't race. Status only — the UI renders
 * Retry/Continue from generationStatus, so no chat message is written.
 */
async function applyTerminalStatus<
  T extends { id: string; generationStatus: GenerationStatus },
>(project: T, next: "IDLE" | "FAILED" | "CANCELLED"): Promise<T> {
  const result = await prisma.project.updateMany({
    where: { id: project.id, generationStatus: "GENERATING" },
    data: { generationStatus: next },
  });

  if (result.count === 0) {
    const fresh = await prisma.project.findUnique({ where: { id: project.id } });
    return fresh ? { ...project, ...fresh } : project;
  }

  return { ...project, generationStatus: next };
}

/**
 * If a project is still GENERATING, ask Inngest for the authoritative run
 * status and update the DB when the run has finished, failed, or never started.
 *
 * When the run cannot be verified (no event id, or the REST API is unreachable),
 * a project that has been GENERATING past {@link GENERATION_STALE_MS} is treated
 * as FAILED so the UI never hangs on the spinner forever. An authoritative
 * "Running" response is always trusted, so genuinely long builds are not killed.
 *
 * @returns The project after any reconcile (or unchanged)
 */
export async function reconcileProjectGenerationStatus<
  T extends {
    id: string;
    generationStatus: GenerationStatus;
    generationStartedAt: Date | null;
    inngestEventId: string | null;
  },
>(project: T): Promise<T> {
  if (project.generationStatus !== "GENERATING") {
    return project;
  }

  // Within the grace window, trust the live GENERATING state so the UI keeps
  // showing the loading spinner. Prompt terminal transitions are handled by the
  // push handlers (inngest/function.failed | cancelled). We only fall back to
  // the (sometimes flaky) REST API once the run is stale — otherwise polling a
  // slow-but-healthy run could wrongly flip it out of GENERATING mid-build.
  if (!isGenerationStale(project.generationStartedAt)) {
    return project;
  }

  // No event id to query — can only rely on staleness.
  if (!project.inngestEventId) {
    return applyTerminalStatus(project, "FAILED");
  }

  try {
    const runs = await getInngestEventRuns(project.inngestEventId);
    const next = mapRunsToGenerationStatus(runs);

    // REST confirms it's genuinely still running (long build): keep the spinner.
    if (next === "GENERATING") {
      return project;
    }

    return applyTerminalStatus(project, next);
  } catch (error) {
    console.error("Failed to reconcile generation status:", error);
    // Stale and unverifiable — give up so the spinner can clear.
    return applyTerminalStatus(project, "FAILED");
  }
}
