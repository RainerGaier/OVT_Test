import { auth } from "@/lib/auth";
import { listUploads } from "@/lib/uploads";
import { UploadPanel } from "@/components/upload/upload-panel";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const uploads = userId ? await listUploads(userId) : [];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Upload files (images, CSV/text, PDF) and manage them here.
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Uploads</h2>
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
      </section>
    </div>
  );
}
