import { auth } from "@/lib/auth";
import { AppNav } from "@/components/nav/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav email={session?.user?.email ?? ""} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
