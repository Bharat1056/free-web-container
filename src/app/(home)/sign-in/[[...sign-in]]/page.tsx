"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c6.1 0 9.1-4.3 9.1-8.4 0-.6-.1-1-.1-1.5H12z"
      />
      <path fill="none" d="M0 0h24v24H0z" />
    </svg>
  );
}

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/?compose=1";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setPending(true);
    setError(null);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });
    } catch {
      setError("Could not start Google sign-in. Try again.");
      setPending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-2 pt-10 md:pt-16">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <span className="font-display text-[15px] font-bold tracking-tight">
          Vibe
        </span>
      </Link>

      <div className="w-full rounded-xl border-2 border-border bg-card p-6 shadow-md md:p-8">
        <div className="mb-6 text-center">
          <h1 className="font-display text-xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in with Google to start building with Vibe
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full gap-2.5"
          disabled={pending}
          onClick={handleGoogle}
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <GoogleIcon className="size-5" />
          )}
          Continue with Google
        </Button>

        {error && (
          <p className="mt-3 text-center text-sm text-destructive">{error}</p>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to use Vibe for building web apps.
        </p>
      </div>

      <button
        type="button"
        className="mt-6 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={() => router.push("/")}
      >
        Back to home
      </button>
    </div>
  );
}

const Page = () => {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center pt-20">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
};

export default Page;
