import Link from "next/link";
import { SignInForm } from "@/components/signin-form";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="bg-card flex w-full max-w-sm flex-col gap-6 rounded-xl border p-6 shadow-sm">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            Welcome back — sign in to continue.
          </p>
        </div>
        <SignInForm />
        <Link
          href="/signup"
          className="text-muted-foreground hover:text-foreground text-center text-sm"
        >
          Need an account? <span className="text-primary">Sign up</span>
        </Link>
      </div>
    </main>
  );
}
