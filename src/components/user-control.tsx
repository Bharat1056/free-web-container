"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  CrownIcon,
  HomeIcon,
  LogOutIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth-client";

interface Props {
  showName?: boolean;
}

function UserAvatar({
  image,
  name,
  email,
  className = "size-8",
}: {
  image?: string | null;
  name?: string | null;
  email?: string | null;
  className?: string;
}) {
  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted ${className}`}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-xs font-bold">
          {(name ?? email ?? "?").charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export const UserControl = ({ showName }: Props) => {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className="group flex h-10 items-center gap-2 rounded-full border-2 border-border bg-card py-1 pr-2 pl-1 shadow-xs transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-secondary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-secondary data-[state=open]:shadow-none"
        >
          <UserAvatar image={user.image} name={user.name} email={user.email} />
          {showName && (
            <span className="hidden max-w-24 truncate text-sm font-bold sm:inline">
              {user.name?.split(" ")[0] ?? "Account"}
            </span>
          )}
          <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        <DropdownMenuLabel className="flex items-center gap-3 rounded-lg bg-muted px-3 py-3 font-normal">
          <UserAvatar
            image={user.image}
            name={user.name}
            email={user.email}
            className="size-10"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/">
            <HomeIcon className="size-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/pricing">
            <CrownIcon className="size-4" />
            Pricing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
