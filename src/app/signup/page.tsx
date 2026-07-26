import { SignUpForm } from "@/components/signup-form";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <SignUpForm />
      <a className="text-sm underline" href="/signin">
        Already have an account? Sign in
      </a>
    </main>
  );
}
