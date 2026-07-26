import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p>Signed in as {session?.user?.email}</p>
      <p className="text-muted-foreground">Charts and uploads land here.</p>
    </main>
  );
}
