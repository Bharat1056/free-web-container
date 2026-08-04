"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutoSize from "react-textarea-autosize";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUpIcon, Loader2Icon, KeyRoundIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import { useRouter } from "next/navigation";
import { PROJECT_TEMPLATES } from "@/modules/home/constants";
import { isTRPCClientError } from "@trpc/client";
import { useSession } from "@/lib/auth-client";
import { showMutationErrorToast } from "@/lib/mutation-error-toast";
import { useGeminiKeyGateOptional } from "@/modules/user-settings/ui/gemini-key-gate";

const formSchema = z.object({
  value: z
    .string()
    .min(1, { message: "Value is required" })
    .max(10000, { message: "Value is too long" }),
});

export function ProjectForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const { data: session } = useSession();
  const user = session?.user;
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const { isConfigured, isRequired, openModal } = useGeminiKeyGateOptional();
  const needsGeminiKey = Boolean(user) && isRequired && !isConfigured;

  const goSignIn = () => {
    router.push("/sign-in?callbackUrl=/?compose=1");
  };

  /**
   * On mount, focus the textarea and scroll the composer into view.
   * Also clears a leftover `?compose=1` flag from sign-in / CTA redirects.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      const params = new URLSearchParams(window.location.search);
      if (params.has("compose")) {
        params.delete("compose");
        const next = params.toString();
        window.history.replaceState(
          null,
          "",
          next ? `/?${next}` : window.location.pathname,
        );
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, []);

  const createProject = useMutation({
    ...trpc.projects.create.mutationOptions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
      queryClient.invalidateQueries(trpc.usage.status.queryOptions());
      router.push(`/projects/${data.id}`);
    },
    onError: (error) => {
      if (isTRPCClientError(error)) {
        if (
          error.data?.code === "PRECONDITION_FAILED" &&
          error.message === "GEMINI_API_KEY_REQUIRED"
        ) {
          openModal();
          return;
        }
        if (
          error.data?.code === "TOO_MANY_REQUESTS" &&
          error.message === "You have run out of credits"
        ) {
          router.push("/pricing");
        }
        if (
          error.data?.code === "BAD_REQUEST" &&
          error.message === "BAD_PROMPT"
        ) {
          toast.error(error?.message);
          return;
        }
      }
      queryClient.invalidateQueries(trpc.usage.status.queryOptions());
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
      showMutationErrorToast(error, {
        onSignIn: goSignIn,
      });
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      goSignIn();
      return;
    }
    if (needsGeminiKey) {
      openModal();
      return;
    }
    await createProject.mutateAsync({
      value: values.value,
    });
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
    },
  });

  const [isFocused, setIsFocused] = useState(false);
  const isPending = createProject.isPending;
  const isButtonDisabled = isPending || !form.formState.isValid;

  const onSelect = (value: string) => {
    form.setValue("value", value, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
    textareaRef.current?.focus();
  };

  return (
    <Form {...form}>
      <section className="space-y-4">
        <form
          ref={composerRef}
          id="project-composer"
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn(
            "relative rounded-xl border-2 border-border bg-card p-3 shadow-md transition-[box-shadow,transform]",
            isFocused && "shadow-lg",
          )}
        >
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <TextareaAutoSize
                {...field}
                ref={(el) => {
                  textareaRef.current = el;
                  field.ref(el);
                }}
                disabled={isPending}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                minRows={3}
                maxRows={8}
                className="w-full resize-none border-none bg-transparent pt-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
                placeholder="Describe the app or website you want to build…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    form.handleSubmit(onSubmit)(e);
                  }
                }}
              />
            )}
          />

          <div className="flex items-end justify-between gap-3 pt-2">
            <div className="font-mono text-[11px] text-muted-foreground">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border-2 border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span>⌘</span>Enter
              </kbd>
              <span className="ml-1.5 hidden sm:inline">to generate</span>
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
                {isPending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUpIcon className="size-3.5" />
                )}
                Generate
              </Button>
            )}
          </div>
        </form>

        <div className="hidden max-w-3xl flex-wrap justify-center gap-2 md:flex">
          {PROJECT_TEMPLATES.map((template) => (
            <Button
              key={template.title}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-2 border-border bg-card text-xs font-medium shadow-xs"
              onClick={() => onSelect(template.prompt)}
            >
              {template.title}
            </Button>
          ))}
        </div>
      </section>
    </Form>
  );
}
