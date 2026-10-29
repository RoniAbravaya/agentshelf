import { getStorage } from "@agentshelf/core";

/** Serves locally stored photos (STORAGE_PROVIDER=local). Supabase storage serves its own public URLs. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const storage = getStorage();
  if (!storage.read) return new Response("Not found", { status: 404 });
  const file = await storage.read(path.join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
