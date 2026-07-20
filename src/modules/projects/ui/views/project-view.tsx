"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Suspense, useState } from "react";
import { MessagesContainer } from "@/modules/projects/ui/components/messages-container";
import { Fragment } from "@prisma/client";
import { ProjectHeader } from "@/modules/projects/ui/components/project-header";
import { FragmentPreview, CanvasPreviewEmpty } from "@/modules/projects/ui/components/fragment-preview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeIcon, EyeIcon } from "lucide-react";
import { FileExplorer } from "@/components/file-explorer";
import { UserControl } from "@/components/user-control";
import { CardLoading, MessageLoading } from "@/components/ui/loading";
import { AppearanceControl } from "@/components/appearance-control";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
}

function CanvasPanel({
  activeFragment,
  tabState,
  setTabState,
}: {
  activeFragment: Fragment | null;
  tabState: "preview" | "code";
  setTabState: (value: "preview" | "code") => void;
}) {
  const hasPreviewUrl = Boolean(activeFragment?.sandboxUrl?.trim());

  return (
    <Tabs
      className="flex h-full flex-col gap-0"
      value={tabState}
      onValueChange={(value) => setTabState(value as "preview" | "code")}
    >
      <div className="flex w-full items-center gap-2 border-b-2 border-border bg-sidebar px-2 py-1.5">
        <TabsList className="h-8 gap-0.5 rounded-lg border-2 border-border bg-muted p-0.5 shadow-xs">
          <TabsTrigger
            value="preview"
            className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-card data-[state=active]:shadow-xs"
          >
            <EyeIcon className="size-3.5" />
            <span>Demo</span>
          </TabsTrigger>
          <TabsTrigger
            value="code"
            className="h-7 rounded-md px-2.5 text-xs data-[state=active]:bg-card data-[state=active]:shadow-xs"
          >
            <CodeIcon className="size-3.5" />
            <span>Code</span>
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-1.5">
          <AppearanceControl className="hidden lg:inline-flex" />
          <UserControl />
        </div>
      </div>
      <TabsContent
        value="preview"
        className="m-0 min-h-0 flex-1 overflow-hidden"
      >
        {hasPreviewUrl && activeFragment ? (
          <FragmentPreview data={activeFragment} />
        ) : (
          <CanvasPreviewEmpty />
        )}
      </TabsContent>
      <TabsContent value="code" className="m-0 min-h-0 flex-1 overflow-hidden">
        {!!activeFragment?.files &&
        Object.keys(activeFragment.files as object).length > 0 ? (
          <FileExplorer
            files={activeFragment.files as { [path: string]: string }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg border-2 border-border bg-muted shadow-xs">
              <CodeIcon className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No files yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Generated source files will appear here once a fragment is ready.
            </p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function ChatPanel({
  projectId,
  setActiveFragment,
}: {
  projectId: string;
  setActiveFragment: (fragment: Fragment | null) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <Suspense
        fallback={
          <CardLoading
            showAvatar={true}
            showTitle={true}
            showDescription={false}
            lines={1}
          />
        }
      >
        <ProjectHeader projectId={projectId} />
      </Suspense>
      <Suspense fallback={<MessageLoading showAvatar={true} lines={3} />}>
        <MessagesContainer
          projectId={projectId}
          setActiveFragment={setActiveFragment}
        />
      </Suspense>
    </div>
  );
}

export const ProjectView = ({ projectId }: Props) => {
  const isDesktop = useIsDesktop();

  const [activeFragment, setActiveFragment] = useState<Fragment | null>(null);
  const [tabState, setTabState] = useState<"preview" | "code">("preview");
  const [mobilePane, setMobilePane] = useState<"chat" | "canvas">("chat");

  return (
    <div className="flex h-dvh flex-col bg-background">
      {!isDesktop && (
        <div className="flex items-center gap-2 border-b-2 border-border px-3 py-2">
          <div className="grid w-full grid-cols-2 gap-1 rounded-lg border-2 border-border bg-muted p-1 shadow-xs">
            {(
              [
                { id: "chat", label: "Chat" },
                { id: "canvas", label: "Preview" },
              ] as const
            ).map((pane) => (
              <button
                key={pane.id}
                type="button"
                onClick={() => setMobilePane(pane.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  mobilePane === pane.id
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground"
                )}
              >
                {pane.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {isDesktop ? (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel
              defaultSize={35}
              minSize={22}
              className="min-h-0 border-r-2 border-border"
            >
              <ChatPanel
                projectId={projectId}
                setActiveFragment={setActiveFragment}
              />
            </ResizablePanel>
            <ResizableHandle className="w-0.5 bg-border transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary" />
            <ResizablePanel defaultSize={65} minSize={45} className="min-h-0">
              <CanvasPanel
                activeFragment={activeFragment}
                tabState={tabState}
                setTabState={setTabState}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : mobilePane === "chat" ? (
          <ChatPanel
            projectId={projectId}
            setActiveFragment={setActiveFragment}
          />
        ) : (
          <CanvasPanel
            activeFragment={activeFragment}
            tabState={tabState}
            setTabState={setTabState}
          />
        )}
      </div>
    </div>
  );
};
