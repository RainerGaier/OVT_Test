"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
];

export function AppNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          Hackathon Starter
        </Link>
        <div className="flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
                    : "text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm"
                }
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {email}
          </span>
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/signin" })}
          >
            Sign out
          </Button>
        </div>
      </nav>
    </header>
  );
}
