"use client";

import { cn } from "@/lib/utils";
import { MessageRole, MessageType } from "@prisma/client";
import { format } from "date-fns";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Assistant replies should be short; clamp anything unexpectedly long. */
const MAX_ASSISTANT_LINES = 8;

interface UserMessageProps {
  content: string;
  isOptimistic?: boolean;
}

const UserMessage = ({ content, isOptimistic }: UserMessageProps) => {
  return (
    <div className="flex justify-end pb-4 pl-10 pr-2">
      <div
        className={cn(
          "max-w-[85%] rounded-xl border-2 border-border bg-surface-yellow/40 px-3.5 py-2.5 text-sm leading-relaxed shadow-sm break-words",
          isOptimistic && "opacity-70",
        )}
      >
        {content}
      </div>
    </div>
  );
};

interface AssistantMessageProps {
  content: string;
  createdAt: Date;
  type: MessageType;
  showRetryButton?: boolean;
  isRetryPending?: boolean;
  onRetry?: () => void;
}

const AssistantMessage = ({
  content,
  createdAt,
  type,
  showRetryButton,
  isRetryPending,
  onRetry,
}: AssistantMessageProps) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.split("\n").length > MAX_ASSISTANT_LINES;
  const isRetryMessage = type === "RETRY";

  return (
    <div
      className={cn(
        "group flex flex-col px-2 pb-4",
        isRetryMessage && "text-destructive",
      )}
    >
      <div className="mb-2 flex items-center gap-2 pl-2">
        <Image
          src="/logo.svg"
          alt="Vibe"
          width={16}
          height={16}
          className="shrink-0"
        />
        <span className="text-sm font-medium tracking-tight">Vibe</span>
        <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {format(createdAt, "HH:mm 'on' MMM dd, yyyy")}
        </span>
      </div>
      <div className="flex flex-col gap-y-3 pl-8 text-sm leading-relaxed">
        <span
          className={cn(
            "whitespace-pre-wrap break-words",
            isLong && !expanded && "line-clamp-[8]",
          )}
        >
          {content}
        </span>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="w-fit text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {showRetryButton && onRetry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={isRetryPending}
            onClick={onRetry}
          >
            {isRetryPending ? "Retrying…" : "Retry"}
          </Button>
        )}
      </div>
    </div>
  );
};

interface Props {
  content: string;
  role: MessageRole;
  createdAt: Date;
  type: MessageType;
  isOptimistic?: boolean;
  showRetryButton?: boolean;
  isRetryPending?: boolean;
  onRetry?: () => void;
}

export const MessageCard = ({
  content,
  role,
  createdAt,
  type,
  isOptimistic,
  showRetryButton,
  isRetryPending,
  onRetry,
}: Props) => {
  if (role === "ASSISTANT") {
    return (
      <AssistantMessage
        content={content}
        createdAt={createdAt}
        type={type}
        showRetryButton={showRetryButton}
        isRetryPending={isRetryPending}
        onRetry={onRetry}
      />
    );
  }

  return <UserMessage content={content} isOptimistic={isOptimistic} />;
};
