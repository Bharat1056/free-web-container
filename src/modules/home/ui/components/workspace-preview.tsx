export const WorkspacePreview = () => {
  return (
    <div className="surface-panel relative mx-auto w-full max-w-3xl overflow-hidden">
      <div className="flex items-center gap-2 border-b-2 border-border px-3 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full border border-border bg-primary" />
          <span className="size-2.5 rounded-full border border-border bg-surface-yellow" />
          <span className="size-2.5 rounded-full border border-border bg-surface-teal" />
        </div>
        <div className="ml-2 flex h-7 flex-1 items-center rounded-lg border-2 border-border bg-muted px-2">
          <span className="truncate text-[11px] font-medium text-muted-foreground">
            vibe.app / workspace
          </span>
        </div>
      </div>

      <div className="grid min-h-[220px] grid-cols-[0.9fr_1.4fr] md:min-h-[280px]">
        <div className="flex flex-col gap-3 border-r-2 border-border bg-sidebar p-3">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="space-y-2">
            <div className="ml-auto h-10 w-[85%] rounded-lg border-2 border-border bg-muted shadow-xs" />
            <div className="h-16 w-[90%] rounded-lg border-2 border-border bg-card p-2.5 shadow-xs">
              <div className="mb-2 h-2.5 w-16 rounded bg-primary/40" />
              <div className="h-2 w-full rounded bg-muted" />
              <div className="mt-1.5 h-2 w-3/4 rounded bg-muted" />
            </div>
            <div className="h-8 w-[70%] rounded-lg border-2 border-border bg-surface-salmon/80 shadow-xs" />
          </div>
          <div className="mt-auto rounded-lg border-2 border-border bg-card p-2 shadow-xs">
            <div className="h-2 w-full rounded bg-muted" />
            <div className="mt-1.5 h-2 w-2/3 rounded bg-muted" />
          </div>
        </div>

        <div className="relative flex flex-col bg-background p-3">
          <div className="mb-3 flex gap-1.5">
            <div className="h-6 w-14 rounded-md border-2 border-border bg-muted shadow-xs" />
            <div className="h-6 w-14 rounded-md border-2 border-border bg-card shadow-xs" />
          </div>
          <div className="relative flex-1 overflow-hidden rounded-lg border-2 border-border bg-card shadow-sm">
            <div className="absolute inset-4 grid grid-cols-3 gap-2">
              <div className="col-span-2 row-span-2 rounded-md border-2 border-border bg-surface-yellow/50 shadow-xs" />
              <div className="rounded-md border-2 border-border bg-surface-teal/50" />
              <div className="rounded-md border-2 border-border bg-surface-salmon/50" />
              <div className="col-span-3 h-8 rounded-md border-2 border-border bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
