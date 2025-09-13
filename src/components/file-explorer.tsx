import { CheckIcon, CopyCheckIcon, CopyIcon } from "lucide-react";
import { useState, useMemo, useCallback, Fragment } from "react";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { CodeView } from "@/components/code-view";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
  BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { convertFilesToTreeItems } from "@/lib/utils";
import { TreeView } from "@/components/tree-view";

type FileCollection = { [path: string]: string };

function getLanguageFromExtension(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension || "txt";
}

interface Props {
  files: FileCollection;
}

interface FileBreadcrumbProps {
  path: string;
}

const FileBreadcrumb = ({ path }: FileBreadcrumbProps) => {
  const segments = path.split("/").filter(Boolean);
  const maxSegments = 3;

  const renderBreadcrumbItems = () => {
    if (segments.length <= maxSegments) {
      return segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <Fragment key={index}>
            <BreadcrumbItem>
              {isLast ? (
                <BreadcrumbPage className="font-medium">
                  {segment}
                </BreadcrumbPage>
              ) : (
                <span className="text-muted-foreground">{segment}</span>
              )}
              {!isLast && <BreadcrumbSeparator />}
            </BreadcrumbItem>
          </Fragment>
        );
      });
    } else {
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      return (
        <Fragment>
          <BreadcrumbItem>
            <span className="text-muted-foreground">{firstSegment}</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium">
              {lastSegment}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </Fragment>
      );
    }
  };

  return (
    <Breadcrumb>
      <BreadcrumbList>{renderBreadcrumbItems()}</BreadcrumbList>
    </Breadcrumb>
  );
};

export const FileExplorer = ({ files }: Props) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(() => {
    const fileKeys = Object.keys(files);
    return fileKeys.length > 0 ? fileKeys[0] : null;
  });

  const [copied, setCopied] = useState(false);

  const treeData = useMemo(() => {
    return convertFilesToTreeItems(files);
  }, [files]);

  const handleSelect = useCallback(
    (path: string) => {
      if (files[path]) {
        setSelectedFile(path);
      }
    },
    [files]
  );

  const handleCopy = useCallback(() => {
    if (!selectedFile) return;
    navigator.clipboard.writeText(files[selectedFile]);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }, [selectedFile, files]);

  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={30} minSize={20} className="bg-sidebar">
        <TreeView
          data={treeData}
          value={selectedFile}
          onSelect={handleSelect}
        />
      </ResizablePanel>
      <ResizableHandle className="hover:bg-primary transition-colors" />
      <ResizablePanel defaultSize={70} minSize={50}>
        {selectedFile && files[selectedFile] ? (
          <div className="h-full w-full flex flex-col">
            <div className="border-b bg-sidebar px-4 py-2 flex justify-between items-center gap-x-2">
              <FileBreadcrumb path={selectedFile} />
              <Hint text="Copy to clipboard" side="bottom">
                <Button
                  variant="outline"
                  size="icon"
                  className="ml-auto"
                  onClick={handleCopy}
                  disabled={copied}
                >
                  {copied ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
              </Hint>
            </div>
            <div className="flex-1 overflow-auto">
              <CodeView
                code={files[selectedFile]}
                language={getLanguageFromExtension(selectedFile)}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a file to view it&apos;s contents
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
