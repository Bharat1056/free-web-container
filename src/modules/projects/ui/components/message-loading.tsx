"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

const ShimmerMessages = () => {
  const messages = [
    "Thinking…",
    "Generating code…",
    "Creating files…",
    "Verifying code…",
    "Creating components…",
    "Creating pages…",
    "Creating layouts…",
    "Optimizing…",
    "Adding final touches…",
    "Almost ready…",
  ];

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-1.5 animate-pulse rounded-full bg-primary" />
      <span className="text-sm text-muted-foreground">
        {messages[currentMessageIndex]}
      </span>
    </div>
  );
};

export const MessageLoading = () => {
  return (
    <div className="group flex flex-col px-2 pb-4">
      <div className="mb-2 flex items-center gap-2 pl-2">
        <Image
          src="/logo.svg"
          alt="Vibe"
          width={16}
          height={16}
          className="shrink-0"
        />
        <span className="text-sm font-medium tracking-tight">Vibe</span>
      </div>
      <div className="flex flex-col gap-y-4 pl-8">
        <ShimmerMessages />
      </div>
    </div>
  );
};
