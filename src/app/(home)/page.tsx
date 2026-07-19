"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { ProjectForm } from "@/modules/home/ui/components/project-form";
import { ProjectsList } from "@/modules/home/ui/components/project-list";
import { WorkspacePreview } from "@/modules/home/ui/components/workspace-preview";

const capabilities = [
  {
    title: "Chat to build",
    description: "Describe features in natural language and iterate in context.",
    tone: "bg-surface-yellow",
  },
  {
    title: "Live preview",
    description: "Watch your app take shape with an instant sandbox preview.",
    tone: "bg-surface-teal",
  },
  {
    title: "Production-ready code",
    description: "Browse generated files and refine until it feels right.",
    tone: "bg-surface-salmon",
  },
] as const;

const faqs = [
  {
    q: "Do I need to know how to code?",
    a: "No. Start with a plain-English prompt — Vibe scaffolds the UI and you iterate from there.",
  },
  {
    q: "Can I see the code?",
    a: "Yes. Every fragment exposes a file explorer so you can review and refine the generated source.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "Free credits reset on a schedule. Upgrade anytime on the pricing page for more capacity.",
  },
];

function Squiggle() {
  return (
    <svg
      className="absolute -bottom-1 left-0 w-full"
      viewBox="0 0 200 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 8 C 30 2, 50 12, 80 6 S 140 2, 198 8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="animate-squiggle text-primary"
      />
    </svg>
  );
}

export default function Page() {
  const { data: session, isPending } = useSession();
  const user = session?.user;

  const firstName = user?.name?.split(" ")[0];

  if (isPending) {
    return <div className="mx-auto min-h-[40vh] w-full max-w-6xl" />;
  }

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <section className="grid items-center gap-10 pb-16 pt-10 md:grid-cols-2 md:gap-12 md:pt-16 lg:pt-20">
          <div className="flex flex-col">
            <p className="mb-4 text-sm font-semibold text-primary">
              AI web development platform
            </p>
            <h1 className="font-display text-balance text-4xl font-bold tracking-tight md:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Build products by{" "}
              <span className="relative inline-block text-primary">
                chatting
                <Squiggle />
              </span>{" "}
              with AI
            </h1>
            <p className="mt-5 max-w-md text-pretty text-base text-muted-foreground md:text-lg">
              Vibe turns ideas into working apps — generate UI, iterate in chat,
              and preview everything in one focused workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-11 gap-2 px-5">
                <Link href="/sign-in?callbackUrl=/?compose=1">
                  Start building
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 px-5">
                <Link href="/pricing">View pricing</Link>
              </Button>
            </div>
          </div>

          <WorkspacePreview />
        </section>

        <section id="features" className="scroll-mt-24 space-y-6 pb-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-primary">
              raw prompts are easy. products are hard.
            </p>
            <h2 className="font-display mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              What Vibe unlocks
            </h2>
          </div>
          <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            {capabilities.map(({ title, description, tone }) => (
              <div
                key={title}
                className={`relative rounded-xl border-2 border-border p-4 text-left shadow-md ${tone}`}
              >
                <div className="absolute -top-2 left-4 h-3 w-10 rounded-sm border border-border/40 bg-card/80" />
                <h3 className="font-display text-base font-bold tracking-tight">
                  {title}
                </h3>
                <p className="font-hand mt-2 text-lg leading-snug tracking-wide text-foreground/80">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="about" className="scroll-mt-24 space-y-6 pb-8">
          <h2 className="font-display text-center text-3xl font-bold tracking-tight md:text-4xl">
            The quick questions
          </h2>
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {faqs.map((faq) => (
              <div
                key={faq.q}
                className="rounded-xl border-2 border-border bg-card p-5 shadow-md"
              >
                <h3 className="font-display text-base font-bold">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col">
      <section className="space-y-10 py-10 md:py-14">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <p className="mb-2 text-sm font-semibold text-primary">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </p>
          <h1 className="font-display text-balance text-3xl font-bold tracking-tight md:text-4xl">
            What do you want to build?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Describe your idea — Vibe will scaffold a project and open the
            workspace.
          </p>
        </div>

        <div className="mx-auto w-full max-w-2xl">
          <ProjectForm />
        </div>

        <div className="mx-auto w-full max-w-4xl pt-4">
          <ProjectsList />
        </div>
      </section>
    </div>
  );
}
