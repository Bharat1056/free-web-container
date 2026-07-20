"use client";

import { ExternalLinkIcon, EyeIcon, RefreshCcwIcon } from "lucide-react";
import { useState } from "react";

import { Fragment } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/hint";

interface Props {
  data: Fragment;
}

function PreviewEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-muted/80 via-background to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:28px_28px]"
      />
      <div className="relative z-10 flex max-w-sm flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl border-2 border-border bg-card shadow-sm">
          <EyeIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold tracking-tight">{title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FragmentPreview({ data }: Props) {
  const [fragmentKey, setFragmentKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const hasPreviewUrl = Boolean(data.sandboxUrl?.trim());

  const onRefresh = () => {
    setFragmentKey((prev) => prev + 1);
  };

  const handleCopy = () => {
    if (!data.sandboxUrl) return;
    navigator.clipboard.writeText(data.sandboxUrl);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  if (!hasPreviewUrl) {
    return (
      <PreviewEmptyState
        title="Preview isn’t ready yet"
        description="Once generation finishes, your live demo will appear here. If something failed, hit Retry in the chat."
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-1.5 border-b-2 border-border bg-sidebar px-2 py-1.5">
        <Hint text="Refresh" side="bottom">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={onRefresh}
          >
            <RefreshCcwIcon className="size-3.5" />
          </Button>
        </Hint>
        <Hint text={copied ? "Copied" : "Copy URL"} side="bottom">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!data.sandboxUrl || copied}
            className="h-8 flex-1 justify-start truncate px-2.5 text-left font-normal text-muted-foreground"
          >
            <span className="truncate text-xs">{data.sandboxUrl}</span>
          </Button>
        </Hint>
        <Hint text="Open in new tab" side="bottom" align="start">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!data.sandboxUrl}
            onClick={() => {
              if (!data.sandboxUrl) return;
              window.open(data.sandboxUrl, "_blank");
            }}
          >
            <ExternalLinkIcon className="size-3.5" />
          </Button>
        </Hint>
      </div>
      <div className="min-h-0 flex-1 bg-muted">
        <iframe
          key={fragmentKey}
          className="h-full w-full border-0 bg-background"
          sandbox="allow-forms allow-scripts allow-same-origin"
          loading="lazy"
          src={data.sandboxUrl}
          title={data.title || "Preview"}
        />
      </div>
    </div>
  );
}

export function CanvasPreviewEmpty() {
  return (
    <PreviewEmptyState
      title="No live preview yet"
      description="Describe what you want to build in chat. When the sandbox is ready, your demo will show up here automatically."
    />
  );
}
