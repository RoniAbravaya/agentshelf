import { randomBytes, randomUUID } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomBase36(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return out;
}

export const ID_PREFIX = {
  user: "usr",
  listing: "lst",
  order: "ord",
  quote: "qt",
  conversation: "cnv",
  message: "msg",
  review: "rev",
  agentKey: "key",
  policy: "pol",
  reservation: "rsv",
} as const;

export function newId(kind: keyof typeof ID_PREFIX, len = 12): string {
  return `${ID_PREFIX[kind]}_${randomBase36(len)}`;
}

/** Opaque buyer API key shown once: ask_live_<32 chars>. */
export function newAgentKey(): { key: string; prefix: string } {
  const body = randomBase36(32);
  const key = `ask_${body}`;
  return { key, prefix: key.slice(0, 10) };
}

export function newRequestId(): string {
  return randomUUID();
}
