export default function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Hackathon Starter</h1>
      <p className="text-muted-foreground">
        Authentication, Claude, uploads, and charts — already wired up.
      </p>
      <div className="flex gap-4">
        <a className="underline" href="/signin">
          Sign in
        </a>
        <a className="underline" href="/signup">
          Sign up
        </a>
      </div>
    </main>
  );
}
