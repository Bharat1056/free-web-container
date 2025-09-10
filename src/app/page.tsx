"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export default function Page() {
  const [value, setValue] = useState("");

  const trpc = useTRPC();

  const { data: messages } = useQuery(trpc.messages.getMany.queryOptions());

  const createMessage = useMutation({
    ...trpc.messages.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Message Created");
    },
    onError: () => {
      toast.error("Failed in message creation");
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
        disabled={createMessage.isPending}
        variant={"default"}
        onClick={() => createMessage.mutate({ value })}
      >
        {createMessage.isPending ? "Invoking..." : "Invoke background job"}
      </Button>
      {JSON.stringify(messages)}
    </div>
  );
}
