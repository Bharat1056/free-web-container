"use client";

import { cn } from "@/lib/utils";
import { MessageRole, MessageType } from "@prisma/client";
import { format } from "date-fns";
import Image from "next/image";
import { useState } from "react";

/** Assistant replies should be short; clamp anything unexpectedly long. */
const MAX_ASSISTANT_LINES = 8;

interface UserMessageProps {
  content: string;
}

const UserMessage = ({ content }: UserMessageProps) => {
  return (
    <div className="flex justify-end pb-4 pl-10 pr-2">
      <div className="max-w-[85%] rounded-xl border-2 border-border bg-surface-yellow/40 px-3.5 py-2.5 text-sm leading-relaxed shadow-sm break-words">
        {content}
      </div>
    </div>
  );
};

interface AssistantMessageProps {
  content: string;
  createdAt: Date;
  type: MessageType;
}

const AssistantMessage = ({
  content,
  createdAt,
  type,
}: AssistantMessageProps) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.split("\n").length > MAX_ASSISTANT_LINES;

  return (
    <div
      className={cn(
        "group flex flex-col px-2 pb-4",
        type === "ERROR" && "text-destructive"
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
            isLong && !expanded && "line-clamp-[8]"
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
      </div>
    </div>
  );
};

interface Props {
  content: string;
  role: MessageRole;
  createdAt: Date;
  type: MessageType;
}

export const MessageCard = ({
  content,
  role,
  createdAt,
  type,
}: Props) => {
  if (role === "ASSISTANT") {
    return (
      <AssistantMessage
        content={content}
        createdAt={createdAt}
        type={type}
      />
    );
  }

  return <UserMessage content={content} />;
};
