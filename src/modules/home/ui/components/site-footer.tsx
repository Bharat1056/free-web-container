import Link from "next/link";
import Image from "next/image";

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Home", href: "/" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Sign in", href: "/sign-in" },
      { label: "Sign up", href: "/sign-up" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
] as const;

export const SiteFooter = () => {
  return (
    <footer className="mt-auto border-t-2 border-border bg-footer">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.2fr_2fr] md:px-6">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Vibe" width={22} height={22} />
            <span className="font-display text-lg font-bold tracking-tight">
              Vibe
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-sm font-medium text-primary">
            turn ideas into working apps
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider">
                {column.title}
              </p>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl items-center border-t border-dashed border-border px-4 py-4 md:px-6">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vibe
        </p>
      </div>
    </footer>
  );
};
