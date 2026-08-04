"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EyeIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showMutationErrorToast } from "@/lib/mutation-error-toast";

type GeminiKeyStatus = {
  required: boolean;
  configured: boolean;
  last4: string | null;
};

type GeminiKeyContextValue = {
  status: GeminiKeyStatus | undefined;
  isLoading: boolean;
  isConfigured: boolean;
  isRequired: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const GeminiKeyContext = createContext<GeminiKeyContextValue | null>(null);

export function useGeminiKeyGate(): GeminiKeyContextValue {
  const ctx = useContext(GeminiKeyContext);
  if (!ctx) {
    throw new Error(
      "useGeminiKeyGate must be used within GeminiKeyGateProvider",
    );
  }
  return ctx;
}

/** Safe hook when provider may be absent (returns permissive defaults). */
export function useGeminiKeyGateOptional(): GeminiKeyContextValue {
  const ctx = useContext(GeminiKeyContext);
  return (
    ctx ?? {
      status: undefined,
      isLoading: false,
      isConfigured: true,
      isRequired: false,
      openModal: () => undefined,
      closeModal: () => undefined,
    }
  );
}

function GeminiKeyForm({
  onSuccess,
  showSettingsLink,
  onOpenSettings,
}: {
  onSuccess?: () => void;
  showSettingsLink?: boolean;
  onOpenSettings?: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const setKey = useMutation({
    ...trpc.userSettings.geminiKey.set.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        trpc.userSettings.geminiKey.status.queryOptions(),
      );
      toast.success("Gemini API key saved");
      setApiKey("");
      onSuccess?.();
    },
    onError: (error) => {
      showMutationErrorToast(error);
    },
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Input
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your Gemini API key"
          autoComplete="off"
          className="pr-10"
          disabled={setKey.isPending}
        />
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setShowKey((v) => !v)}
          aria-label={showKey ? "Hide API key" : "Show API key"}
        >
          {showKey ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={setKey.isPending || apiKey.trim().length < 20}
          onClick={() => setKey.mutate({ apiKey: apiKey.trim() })}
        >
          {setKey.isPending ? "Saving…" : "Save and continue"}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
          >
            Get a key
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </Button>
        {showSettingsLink ? (
          onOpenSettings ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onOpenSettings}
            >
              Open settings
            </Button>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function GeminiKeyRequiredDialog({
  open,
  onOpenChange,
  dismissible,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissible: boolean;
  onOpenSettings?: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!dismissible && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={dismissible}
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissible) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-5" />
            Add your Gemini API key
          </DialogTitle>
          <DialogDescription>
            Generation runs on your Gemini account. Add a key from Google AI
            Studio to continue.
          </DialogDescription>
        </DialogHeader>
        <GeminiKeyForm
          showSettingsLink
          onOpenSettings={onOpenSettings}
          onSuccess={() => onOpenChange(false)}
        />
        <DialogFooter className="sm:justify-start">
          <p className="text-xs text-muted-foreground">
            Your key is encrypted at rest. We never show the full key again.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GeminiKeyGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;
  const [manualOpen, setManualOpen] = useState(false);

  const { data: status, isLoading } = useQuery({
    ...trpc.userSettings.geminiKey.status.queryOptions(),
    enabled: Boolean(user),
  });

  const isRequired = Boolean(status?.required);
  const isConfigured = Boolean(status?.configured);
  const isOnSettingsPage = pathname === "/settings";
  const needsKey =
    Boolean(user) &&
    !sessionPending &&
    isRequired &&
    !isConfigured &&
    !isLoading &&
    !isOnSettingsPage;

  const openModal = useCallback(() => setManualOpen(true), []);
  const closeModal = useCallback(() => setManualOpen(false), []);

  useEffect(() => {
    if (isConfigured || isOnSettingsPage) {
      setManualOpen(false);
    }
  }, [isConfigured, isOnSettingsPage]);

  const handleOpenSettings = useCallback(() => {
    setManualOpen(false);
    router.push("/settings");
  }, [router]);

  const value = useMemo<GeminiKeyContextValue>(
    () => ({
      status,
      isLoading: sessionPending || (Boolean(user) && isLoading),
      isConfigured: !isRequired || isConfigured,
      isRequired,
      openModal,
      closeModal,
    }),
    [
      status,
      sessionPending,
      user,
      isLoading,
      isRequired,
      isConfigured,
      openModal,
      closeModal,
    ],
  );

  return (
    <GeminiKeyContext.Provider value={value}>
      {children}
      {user ? (
        <GeminiKeyRequiredDialog
          open={needsKey || manualOpen}
          onOpenChange={(open) => {
            if (needsKey && !open) return;
            setManualOpen(open);
          }}
          dismissible={!needsKey}
          onOpenSettings={handleOpenSettings}
        />
      ) : null}
    </GeminiKeyContext.Provider>
  );
}

export { GeminiKeyForm };
