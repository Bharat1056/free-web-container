"use client";

import { MessageCard } from "@/modules/projects/ui/components/message-card";
import { MessageForm } from "@/modules/projects/ui/components/message-form";
import { MessageLoading } from "@/modules/projects/ui/components/message-loading";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { Fragment } from "@prisma/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { showMutationErrorToast } from "@/lib/mutation-error-toast";

interface Props {
  projectId: string;
  setActiveFragment: (fragment: Fragment | null) => void;
}

export const MessagesContainer = ({
  projectId,
  setActiveFragment,
}: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageRef = useRef<string | null>(null);

  const { data: messages } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions(
      {
        projectId,
      },
      {
        refetchInterval: 5000,
      }
    )
  );

  const { data: project } = useSuspenseQuery(
    trpc.projects.getOne.queryOptions(
      { id: projectId },
      {
        refetchInterval: 5000,
      }
    )
  );

  const createMessage = useMutation({
    ...trpc.messages.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries(
        trpc.messages.getMany.queryOptions({ projectId })
      );
      queryClient.invalidateQueries(
        trpc.projects.getOne.queryOptions({ id: projectId })
      );
      queryClient.invalidateQueries(trpc.usage.status.queryOptions());
    },
    onError: (error) => {
      showMutationErrorToast(error);
    },
  });

  useEffect(() => {
    const lastAssistantMessage = messages
      .filter((message) => message.role === "ASSISTANT" && !!message.fragment)
      .at(-1);
    if (
      lastAssistantMessage?.fragment &&
      lastAssistantMessage.fragment.id !== lastAssistantMessageRef.current
    ) {
      setActiveFragment(lastAssistantMessage.fragment);
      lastAssistantMessageRef.current = lastAssistantMessage.fragment.id;
    }
  }, [messages, setActiveFragment]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, project.generationStatus]);

  const lastRealUserPrompt = useMemo(() => {
    const userMessages = messages.filter((m) => m.role === "USER");
    // Prefer the last prompt that is not a bare "continue" resume keyword.
    for (let i = userMessages.length - 1; i >= 0; i--) {
      const content = userMessages[i].content.trim();
      if (!/^(continue|keep going|resume|retry|try again|finish it)$/i.test(content)) {
        return content;
      }
    }
    return userMessages.at(-1)?.content.trim() ?? "";
  }, [messages]);

  const status = project.generationStatus;
  const isGenerating = status === "GENERATING";
  const isFailed = status === "FAILED";
  const isCancelled = status === "CANCELLED";

  const handleRetry = () => {
    if (!lastRealUserPrompt || createMessage.isPending) return;
    createMessage.mutate({
      projectId,
      value: lastRealUserPrompt,
    });
  };

  const handleContinue = () => {
    if (createMessage.isPending) return;
    createMessage.mutate({
      projectId,
      value: "continue",
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-1 pt-2">
          {messages.map((message) => (
            <MessageCard
              key={message.id}
              content={message.content}
              role={message.role}
              createdAt={message.createdAt}
              type={message.type}
            />
          ))}
          {isGenerating && <MessageLoading />}
          {isFailed && (
            <div className="mx-2 mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-sm text-muted-foreground">
                Generation failed. Retry the last request, or send a new message.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                disabled={!lastRealUserPrompt || createMessage.isPending}
                onClick={handleRetry}
              >
                {createMessage.isPending ? "Retrying…" : "Retry"}
              </Button>
            </div>
          )}
          {isCancelled && (
            <div className="mx-2 mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-sm text-muted-foreground">
                Generation was cancelled. Continue from where it left off, or send a new message.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                disabled={createMessage.isPending}
                onClick={handleContinue}
              >
                {createMessage.isPending ? "Continuing…" : "Continue"}
              </Button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="relative p-3 pt-1">
        <div className="pointer-events-none absolute -top-6 right-0 left-0 h-6 bg-gradient-to-b from-transparent to-background/80" />
        <MessageForm projectId={projectId} />
      </div>
    </div>
  );
};
