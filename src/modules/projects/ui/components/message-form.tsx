"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutoSize from "react-textarea-autosize";
import { z } from "zod";
import { useState } from "react";
import { ArrowUpIcon, Loader2Icon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import { Usage } from "@/modules/projects/ui/components/usage";
import { useRouter } from "next/navigation";
import { showMutationErrorToast } from "@/lib/mutation-error-toast";

interface Props {
  projectId: string;
}

const formSchema = z.object({
  value: z
    .string()
    .min(1, { message: "Value is required" })
    .max(10000, { message: "Value is too long" }),
});

export const MessageForm = ({ projectId }: Props) => {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;

  const openSignIn = () => {
    router.push(`/sign-in?callbackUrl=/projects/${projectId}`);
  };

  const { data: usage } = useQuery(trpc.usage.status.queryOptions());
  const messagesQuery = trpc.messages.getMany.queryOptions({ projectId });

  const createMessage = useMutation({
    ...trpc.messages.create.mutationOptions(),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: messagesQuery.queryKey,
      });

      const now = new Date();

      queryClient.setQueryData(messagesQuery.queryKey, (current) => [
        ...(current ?? []),
        {
          id: `optimistic-${crypto.randomUUID()}`,
          content: variables.value,
          role: "USER" as const,
          type: "RESULT" as const,
          embedding: [],
          createdAt: now,
          updatedAt: now,
          projectId,
          fragment: null,
        },
      ]);

      form.reset();
      return undefined;
    },
    onError: (error, variables) => {
      queryClient.setQueryData(messagesQuery.queryKey, (current) =>
        current?.filter((message) => !message.id.startsWith("optimistic-"))
      );
      form.setValue("value", variables.value, {
        shouldDirty: true,
        shouldValidate: true,
      });

      if (
        error.data?.code === "TOO_MANY_REQUESTS" &&
        error.message === "You have run out of credits"
      ) {
        router.push("/pricing");
      }
      showMutationErrorToast(error, { onSignIn: openSignIn });
    },
    onSettled: () => {
      queryClient.invalidateQueries(
        messagesQuery
      );
      queryClient.invalidateQueries(
        trpc.projects.getOne.queryOptions({ id: projectId })
      );
      queryClient.invalidateQueries(trpc.usage.status.queryOptions());
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!sessionPending && !user) {
      openSignIn();
      return;
    }

    await createMessage.mutateAsync({
      value: values.value,
      projectId,
    });
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
    },
  });

  const [isFocused, setIsFocused] = useState(false);
  const isPending = createMessage.isPending;
  const isButtonDisabled = isPending || !form.formState.isValid;

  return (
    <Form {...form}>
      <Usage
        points={usage?.remainingPoints ?? 0}
        msBeforeNext={usage?.msBeforeNext ?? 0}
      />
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          "relative rounded-b-xl border-2 border-t-0 border-border bg-card p-3 transition-shadow",
          isFocused && "shadow-sm"
        )}
      >
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <TextareaAutoSize
              {...field}
              disabled={isPending}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              minRows={2}
              maxRows={8}
              className="w-full resize-none border-none bg-transparent pt-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
              placeholder="Ask for a change or describe the next feature…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  form.handleSubmit(onSubmit)(e);
                }
              }}
            />
          )}
        />

        <div className="flex items-end justify-between gap-2 pt-2">
          <div className="font-mono text-[11px] text-muted-foreground">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border-2 border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span>⌘</span>Enter
            </kbd>
          </div>
          <Button
            type="submit"
            disabled={isButtonDisabled}
            size="sm"
            className="h-8 gap-1.5 px-3"
          >
            {isPending ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <ArrowUpIcon className="size-3.5" />
            )}
            Send
          </Button>
        </div>
      </form>
    </Form>
  );
};
