"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [value, setValue] = useState("");

  const trpc = useTRPC();

  const createProject = useMutation({
    ...trpc.projects.create.mutationOptions(),
    onSuccess: (data) => {
      router.push(`/projects/${data.id}`);
    },
    onError: () => {
      toast.error("Failed in Project creation");
    },
  });

  return (
    <div className="h-screen w-screen flex justify-center items-center">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-y-4 justify-center">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mb-4"
        />
        <Button
          disabled={createProject.isPending}
          variant={"default"}
          onClick={() => createProject.mutate({ value })}
        >
          {createProject.isPending ? "Invoking..." : "Invoke background job"}
        </Button>
      </div>
    </div>
  );
}
