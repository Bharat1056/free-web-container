"use client";

import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { FolderOpenIcon } from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { useSession } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const ProjectsList = () => {
  const trpc = useTRPC();
  const { data: session } = useSession();
  const user = session?.user;
  const { data: projects, isLoading } = useQuery(
    trpc.projects.getMany.queryOptions(),
  );

  if (!user) return null;

  return (
    <section className="w-full space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight">
            Recent projects
          </h2>
          <p className="text-sm text-muted-foreground">
            Continue where you left off
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[88px] rounded-xl border-2 border-border"
            />
          ))}
        </div>
      ) : !projects?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card px-6 py-12 text-center">
          <FolderOpenIcon className="mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No projects yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Describe what you want to build above and hit Generate to create
            your first project.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className={cn(
                "group flex items-center gap-3 rounded-xl border-2 border-border bg-card p-4 shadow-sm transition-[transform,box-shadow]",
                "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted">
                <Image
                  src="/logo.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold tracking-tight">
                  {project.name}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Updated{" "}
                  {formatDistanceToNow(project.updatedAt, {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
};
