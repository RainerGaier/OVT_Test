import { SignInForm } from "@/components/signin-form";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <SignInForm />
      <a className="text-sm underline" href="/signup">
        Need an account? Sign up
      </a>
    </main>
  );
}
