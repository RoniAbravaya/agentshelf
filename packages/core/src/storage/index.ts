import fs from "node:fs/promises";
import path from "node:path";
import { findRepoRoot, getEnv } from "../env";

/**
 * Photo storage. Two adapters behind one interface:
 * - local: files under UPLOADS_DIR (default ./.data/uploads), served by the web
 *   app at /uploads/<key>. Zero setup; fine for local demos. On Render the disk
 *   is ephemeral, so use supabase there.
 * - supabase: Supabase Storage public bucket via the REST API (service role key).
 */
export interface StoredPhoto {
  key: string;
  url: string;
}

export interface StorageAdapter {
  readonly name: "local" | "supabase";
  put(key: string, bytes: Buffer, contentType: string): Promise<StoredPhoto>;
  /** Only the local adapter serves files itself. */
  read?(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

export function localUploadsDir(): string {
  const env = getEnv();
  return env.UPLOADS_DIR ?? path.join(findRepoRoot(), ".data", "uploads");
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".jpg";
  }
}

class LocalStorage implements StorageAdapter {
  readonly name = "local" as const;
  constructor(private readonly publicBase: string) {}
  async put(key: string, bytes: Buffer, _contentType: string): Promise<StoredPhoto> {
    const safe = safeKey(key);
    const file = path.join(localUploadsDir(), safe);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    return { key: safe, url: `${this.publicBase}/uploads/${safe.split(path.sep).join("/")}` };
  }
  async read(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    const safe = safeKey(key);
    const file = path.join(localUploadsDir(), safe);
    try {
      const bytes = await fs.readFile(file);
      return { bytes, contentType: MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }
}

class SupabaseStorage implements StorageAdapter {
  readonly name = "supabase" as const;
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}
  async put(key: string, bytes: Buffer, contentType: string): Promise<StoredPhoto> {
    const safe = safeKey(key).split(path.sep).join("/");
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${safe}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
    return { key: safe, url: `${this.url}/storage/v1/object/public/${this.bucket}/${safe}` };
  }
}

function safeKey(key: string): string {
  const normalized = path.normalize(key).replace(/^([/\\.])+/, "");
  if (normalized.includes("..")) throw new Error("invalid storage key");
  return normalized;
}

let cached: StorageAdapter | null = null;
export function getStorage(): StorageAdapter {
  if (cached) return cached;
  const env = getEnv();
  if (env.STORAGE_PROVIDER === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("STORAGE_PROVIDER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    cached = new SupabaseStorage(env.SUPABASE_URL.replace(/\/$/, ""), env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_STORAGE_BUCKET);
  } else {
    cached = new LocalStorage(env.APP_URL.replace(/\/$/, ""));
  }
  return cached;
}

/** Sniff image type from magic bytes; returns null for anything that is not JPEG/PNG/WebP/GIF. */
export function sniffImageType(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  return null;
}
