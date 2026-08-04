"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutoSize from "react-textarea-autosize";
import { z } from "zod";
import { useState } from "react";
import { ArrowUpIcon, KeyRoundIcon, Loader2Icon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import { Usage } from "@/modules/projects/ui/components/usage";
import { useRouter } from "next/navigation";
import { useGeminiKeyGateOptional } from "@/modules/user-settings/ui/gemini-key-gate";
import { isTRPCClientError } from "@trpc/client";

interface Props {
  projectId: string;
  isSendPending: boolean;
  onSendMessage: (value: string) => Promise<void>;
}

const formSchema = z.object({
  value: z
    .string()
    .min(1, { message: "Value is required" })
    .max(10000, { message: "Value is too long" }),
});

export const MessageForm = ({
  projectId,
  isSendPending,
  onSendMessage,
}: Props) => {
  const router = useRouter();
  const trpc = useTRPC();
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;
  const { isConfigured, isRequired, openModal } = useGeminiKeyGateOptional();
  const needsGeminiKey = Boolean(user) && isRequired && !isConfigured;

  const openSignIn = () => {
    router.push(`/sign-in?callbackUrl=/projects/${projectId}`);
  };

  const { data: usage } = useQuery(trpc.usage.status.queryOptions());

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
    },
  });

  const [isFocused, setIsFocused] = useState(false);
  const isButtonDisabled = isSendPending || !form.formState.isValid;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!sessionPending && !user) {
      openSignIn();
      return;
    }

    if (needsGeminiKey) {
      openModal();
      return;
    }

    const messageContent = values.value;
    form.reset();
    try {
      await onSendMessage(messageContent);
    } catch (error) {
      if (
        isTRPCClientError(error) &&
        error.data?.code === "PRECONDITION_FAILED" &&
        error.message === "GEMINI_API_KEY_REQUIRED"
      ) {
        openModal();
      }
      throw error;
    }
  };

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
          isFocused && "shadow-sm",
        )}
      >
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <TextareaAutoSize
              {...field}
              disabled={isSendPending}
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
          {needsGeminiKey ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3"
              onClick={openModal}
            >
              <KeyRoundIcon className="size-3.5" />
              Add Gemini API key
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isButtonDisabled}
              size="sm"
              className="h-8 gap-1.5 px-3"
            >
              {isSendPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <ArrowUpIcon className="size-3.5" />
              )}
              Send
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};
