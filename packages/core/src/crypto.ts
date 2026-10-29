import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

/** 32-byte key from DATA_ENCRYPTION_KEY (base64) or derived from SESSION_SECRET for local dev. */
function key(): Buffer {
  const env = getEnv();
  if (env.DATA_ENCRYPTION_KEY) {
    const buf = Buffer.from(env.DATA_ENCRYPTION_KEY, "base64");
    if (buf.length === 32) return buf;
    return createHash("sha256").update(env.DATA_ENCRYPTION_KEY).digest();
  }
  return createHash("sha256").update(`agentshelf:${env.SESSION_SECRET}`).digest();
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext), prefixed with "enc1:". */
export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc1:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

export function decryptString(payload: string): string {
  if (!payload.startsWith("enc1:")) throw new Error("not an encrypted payload");
  const buf = Buffer.from(payload.slice(5), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
