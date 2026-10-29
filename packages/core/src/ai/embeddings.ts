import { EMBEDDING_DIM } from "../db/schema";
import { getEnv } from "../env";

/**
 * Text embeddings for semantic search. Provider-agnostic: OpenAI or Voyage,
 * both at 1024 dimensions to match the pgvector column. Returns null when no
 * provider is configured, in which case search uses Postgres full-text only.
 */
export async function embedText(text: string, kind: "document" | "query" = "document"): Promise<number[] | null> {
  const env = getEnv();
  const input = text.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!input) return null;
  if (env.EMBEDDINGS_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const res = await client.embeddings.create({
      model: env.EMBEDDINGS_MODEL ?? "text-embedding-3-small",
      input,
      dimensions: EMBEDDING_DIM,
    });
    return res.data[0]?.embedding ?? null;
  }
  if (env.EMBEDDINGS_PROVIDER === "voyage" && env.VOYAGE_API_KEY) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: [input],
        model: env.EMBEDDINGS_MODEL ?? "voyage-4-lite",
        input_type: kind,
        output_dimension: EMBEDDING_DIM,
      }),
    });
    if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return body.data?.[0]?.embedding ?? null;
  }
  return null;
}

export function embeddingsEnabled(): boolean {
  const env = getEnv();
  const configured = (env.EMBEDDINGS_PROVIDER === "openai" && !!env.OPENAI_API_KEY) || (env.EMBEDDINGS_PROVIDER === "voyage" && !!env.VOYAGE_API_KEY);
  return configured && vectorAvailableSync();
}

let vectorFlag: boolean | null = null;
/** Set by runMigrations; false when the database has no pgvector extension. */
export function setVectorAvailable(v: boolean): void {
  vectorFlag = v;
}
function vectorAvailableSync(): boolean {
  return vectorFlag !== false;
}
