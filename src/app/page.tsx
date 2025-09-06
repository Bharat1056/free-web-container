"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export default function Page() {
  const [value, setValue] = useState("");

  const trpc = useTRPC();

  const invoke = useMutation({
    ...trpc.invoke.mutationOptions(),
    onSuccess: () => {
      toast.success("Background job invoked");
    },
    onError: () => {
      toast.error("Failed to invoke background job");
    },
  });

  return (
    <div className="p-4 max-w-7xl max-auto">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mb-4"
      />
      <Button
        disabled={invoke.isPending}
        variant={"default"}
        onClick={() => invoke.mutate({ value })}
      >
        {invoke.isPending ? "Invoking..." : "Invoke background job"}
      </Button>
    </div>
  );
}
