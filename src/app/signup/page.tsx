import Link from "next/link";
import { SignUpForm } from "@/components/signup-form";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="bg-card flex w-full max-w-sm flex-col gap-6 rounded-xl border p-6 shadow-sm">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Create your account
          </h1>
          <p className="text-muted-foreground text-sm">
            Start building in seconds.
          </p>
        </div>
        <SignUpForm />
        <Link
          href="/signin"
          className="text-muted-foreground hover:text-foreground text-center text-sm"
        >
          Already have an account? <span className="text-primary">Sign in</span>
        </Link>
      </div>
    </main>
  );
}
