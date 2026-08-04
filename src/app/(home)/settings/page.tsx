"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, KeyRoundIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showMutationErrorToast } from "@/lib/mutation-error-toast";
import { GeminiKeyForm } from "@/modules/user-settings/ui/gemini-key-gate";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SettingsPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = useSession();
  const [replaceKey, setReplaceKey] = useState("");

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.push("/sign-in?callbackUrl=/settings");
    }
  }, [session, sessionPending, router]);

  const { data: status, isLoading } = useQuery({
    ...trpc.userSettings.geminiKey.status.queryOptions(),
    enabled: Boolean(session?.user),
  });

  const clearKey = useMutation({
    ...trpc.userSettings.geminiKey.clear.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        trpc.userSettings.geminiKey.status.queryOptions(),
      );
      toast.success("Gemini API key removed");
      setReplaceKey("");
    },
    onError: (error) => showMutationErrorToast(error),
  });

  const setKey = useMutation({
    ...trpc.userSettings.geminiKey.set.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        trpc.userSettings.geminiKey.status.queryOptions(),
      );
      toast.success("Gemini API key updated");
      setReplaceKey("");
    },
    onError: (error) => showMutationErrorToast(error),
  });

  if (sessionPending || !session?.user) {
    return (
      <div className="mx-auto max-w-lg py-16 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-8 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account and AI provider keys.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border-2 border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border-2 border-border bg-muted p-2">
            <KeyRoundIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">AI provider</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Gemini API key for generation and embeddings.
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !status?.required ? (
          <p className="text-sm text-muted-foreground">
            Keys are managed by the server in this environment. Per-user Gemini
            BYOK is enabled when <code className="font-mono text-xs">APP_MODE=prod</code>.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md border-2 border-border bg-muted px-2 py-0.5 text-xs font-medium">
                {status.configured ? "Configured" : "Missing"}
              </span>
              {status.configured && status.last4 ? (
                <span className="font-mono text-xs text-muted-foreground">
                  …{status.last4}
                </span>
              ) : null}
            </div>

            {status.configured ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Paste a new key to replace the current one.
                </p>
                <Input
                  type="password"
                  value={replaceKey}
                  onChange={(e) => setReplaceKey(e.target.value)}
                  placeholder="New Gemini API key"
                  autoComplete="off"
                  disabled={setKey.isPending}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      setKey.isPending || replaceKey.trim().length < 20
                    }
                    onClick={() =>
                      setKey.mutate({ apiKey: replaceKey.trim() })
                    }
                  >
                    {setKey.isPending ? "Saving…" : "Replace key"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={clearKey.isPending}
                    onClick={() => clearKey.mutate()}
                  >
                    <Trash2Icon className="size-3.5" />
                    Remove key
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get a key
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <GeminiKeyForm />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
