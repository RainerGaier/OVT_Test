import { auth } from "@/lib/auth";
import { listUploads } from "@/lib/uploads";
import { UploadPanel } from "@/components/upload/upload-panel";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const uploads = userId ? await listUploads(userId) : [];
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p>Signed in as {session?.user?.email}</p>
      <UploadPanel
        initialUploads={uploads.map((u) => ({
          id: u.id,
          filename: u.filename,
          url: u.url,
          contentType: u.contentType,
          size: u.size,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
