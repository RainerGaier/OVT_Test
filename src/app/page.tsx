import Link from "next/link";

export default function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Hackathon Starter
        </h1>
        <p className="text-muted-foreground max-w-md text-lg">
          Authentication, Claude chat, file uploads, and charts — already wired
          up, tested, and deployed.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/signup"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Get started
        </Link>
        <Link
          href="/signin"
          className="hover:bg-secondary inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
