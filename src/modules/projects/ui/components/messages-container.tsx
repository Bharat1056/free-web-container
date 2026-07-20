"use client";

import { MessageCard } from "@/modules/projects/ui/components/message-card";
import { MessageForm } from "@/modules/projects/ui/components/message-form";
import { MessageLoading } from "@/modules/projects/ui/components/message-loading";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { Fragment } from "@prisma/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useOptimistic, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showMutationErrorToast } from "@/lib/mutation-error-toast";
import { RETRY_USER_FACING_CONTENT } from "@/lib/retry";

interface Props {
  projectId: string;
  setActiveFragment: (fragment: Fragment | null) => void;
}

type ChatMessageRow = {
  id: string;
  content: string;
  role: "USER" | "ASSISTANT";
  type: "RESULT" | "RETRY";
  embedding: number[];
  errorDetails: unknown;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  fragment: Fragment | null;
};

type OptimisticChatState = {
  messages: ChatMessageRow[];
  isGenerating: boolean;
};

type OptimisticChatAction =
  | { type: "send-user-message"; content: string; tempId: string }
  | { type: "retry-generation" };

function createOptimisticUserMessage(input: {
  tempId: string;
  content: string;
  projectId: string;
}): ChatMessageRow {
  const now = new Date();
  return {
    id: input.tempId,
    content: input.content,
    role: "USER",
    type: "RESULT",
    embedding: [],
    errorDetails: null,
    createdAt: now,
    updatedAt: now,
    projectId: input.projectId,
    fragment: null,
  };
}

export const MessagesContainer = ({
  projectId,
  setActiveFragment,
}: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageRef = useRef<string | null>(null);
  const [isMutationPending, startTransition] = useTransition();

  const { data: messages } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions(
      { projectId },
      { refetchInterval: 5000 },
    ),
  );

  const { data: project } = useSuspenseQuery(
    trpc.projects.getOne.queryOptions(
      { id: projectId },
      { refetchInterval: 5000 },
    ),
  );

  const serverChatState: OptimisticChatState = {
    messages: messages as ChatMessageRow[],
    isGenerating: project.generationStatus === "GENERATING",
  };

  const [optimisticChat, applyOptimisticChat] = useOptimistic(
    serverChatState,
    (currentState, action: OptimisticChatAction): OptimisticChatState => {
      if (action.type === "send-user-message") {
        return {
          messages: [
            ...currentState.messages,
            createOptimisticUserMessage({
              tempId: action.tempId,
              content: action.content,
              projectId,
            }),
          ],
          isGenerating: true,
        };
      }

      return {
        ...currentState,
        isGenerating: true,
      };
    },
  );

  const createMessage = useMutation({
    ...trpc.messages.create.mutationOptions(),
  });

  const invalidateChatQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries(
        trpc.messages.getMany.queryOptions({ projectId }),
      ),
      queryClient.invalidateQueries(
        trpc.projects.getOne.queryOptions({ id: projectId }),
      ),
      queryClient.invalidateQueries(trpc.usage.status.queryOptions()),
    ]);
  };

  const openSignIn = () => {
    router.push(`/sign-in?callbackUrl=/projects/${projectId}`);
  };

  const handleMutationError = (error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "data" in error &&
      (error as { data?: { code?: string } }).data?.code ===
        "TOO_MANY_REQUESTS" &&
      error instanceof Error &&
      error.message === "You have run out of credits"
    ) {
      router.push("/pricing");
    }
    showMutationErrorToast(error, { onSignIn: openSignIn });
  };

  const sendUserMessage = async (content: string) => {
    const tempId = `optimistic-${crypto.randomUUID()}`;

    startTransition(async () => {
      applyOptimisticChat({
        type: "send-user-message",
        content,
        tempId,
      });

      try {
        await createMessage.mutateAsync({
          projectId,
          value: content,
          retry: false,
        });
        await invalidateChatQueries();
      } catch (error) {
        handleMutationError(error);
      }
    });
  };

  const retryGeneration = () => {
    startTransition(async () => {
      applyOptimisticChat({ type: "retry-generation" });

      try {
        await createMessage.mutateAsync({
          projectId,
          retry: true,
        });
        await invalidateChatQueries();
      } catch (error) {
        handleMutationError(error);
      }
    });
  };

  useEffect(() => {
    const lastAssistantWithFragment = optimisticChat.messages
      .filter(
        (message) =>
          message.role === "ASSISTANT" &&
          !!message.fragment &&
          !message.fragment.disabled,
      )
      .at(-1);

    if (lastAssistantWithFragment?.fragment) {
      const fragmentForPreview = {
        ...lastAssistantWithFragment.fragment,
        sandboxUrl:
          project.sandboxUrl ?? lastAssistantWithFragment.fragment.sandboxUrl,
      };

      if (
        lastAssistantWithFragment.fragment.id !==
          lastAssistantMessageRef.current ||
        fragmentForPreview.sandboxUrl !==
          lastAssistantWithFragment.fragment.sandboxUrl
      ) {
        setActiveFragment(fragmentForPreview);
        lastAssistantMessageRef.current = lastAssistantWithFragment.fragment.id;
      }
      return;
    }

    if (project.sandboxUrl) {
      setActiveFragment({
        id: `project-live-${projectId}`,
        messageId: `project-live-${projectId}`,
        sandboxUrl: project.sandboxUrl,
        title: "Live preview",
        files: {},
        disabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      lastAssistantMessageRef.current = `project-live-${projectId}`;
      return;
    }

    setActiveFragment(null);
    lastAssistantMessageRef.current = null;
  }, [
    optimisticChat.messages,
    project.sandboxUrl,
    projectId,
    setActiveFragment,
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    optimisticChat.messages.length,
    optimisticChat.isGenerating,
    project.generationStatus,
  ]);

  const generationStatus = project.generationStatus;
  const isFailed =
    generationStatus === "FAILED" || generationStatus === "CANCELLED";
  const isComposerLocked = isFailed && !optimisticChat.isGenerating;
  const showLoadingIndicator = optimisticChat.isGenerating;
  const isActionPending = isMutationPending || createMessage.isPending;

  const latestRetryMessageId = [...optimisticChat.messages]
    .reverse()
    .find((message) => message.role === "ASSISTANT" && message.type === "RETRY")
    ?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-1 pt-2">
          {optimisticChat.messages.map((message) => (
            <MessageCard
              key={message.id}
              content={message.content}
              role={message.role}
              createdAt={message.createdAt}
              type={message.type}
              isOptimistic={message.id.startsWith("optimistic-")}
              showRetryButton={
                isComposerLocked && message.id === latestRetryMessageId
              }
              isRetryPending={isActionPending}
              onRetry={retryGeneration}
            />
          ))}
          {showLoadingIndicator && <MessageLoading />}
          {isComposerLocked && !latestRetryMessageId && (
            <div className="mx-2 mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <p className="mb-2 text-sm text-destructive">
                {RETRY_USER_FACING_CONTENT}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isActionPending}
                onClick={retryGeneration}
              >
                {isActionPending ? "Retrying…" : "Retry"}
              </Button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="relative p-3 pt-1">
        <div className="pointer-events-none absolute -top-6 right-0 left-0 h-6 bg-gradient-to-b from-transparent to-background/80" />
        {!isComposerLocked && (
          <MessageForm
            projectId={projectId}
            isSendPending={isActionPending}
            onSendMessage={sendUserMessage}
          />
        )}
      </div>
    </div>
  );
};
