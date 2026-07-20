"use client";

import { useState } from "react";
import { ExternalLinkIcon, RefreshCcwIcon } from "lucide-react";

import { Fragment } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/hint";

interface Props {
  data: Fragment;
}

export function FragmentPreview({ data }: Props) {
  const [fragmentKey, setFragmentKey] = useState(0);
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-1.5 border-b-2 border-border bg-sidebar px-2 py-1.5">
        <Hint text="Refresh" side="bottom">
          <Button size="sm" variant="outline" className="h-8" onClick={onRefresh}>
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
            <span className="truncate text-xs">
              {data.sandboxUrl || "No sandbox URL"}
            </span>
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
