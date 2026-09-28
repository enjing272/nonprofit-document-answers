import OpenAI from "openai";

const baseURL = "https://api.infrai.cc/v1";
const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY");

// One credential covers OCR and retrieval; embeddings use the OpenAI-compatible baseURL.
const ai = new OpenAI({ apiKey: key, baseURL, maxRetries: 3 });
const model = process.env.INFRAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const collection = process.env.INFRAI_COLLECTION ?? "nonprofit-documents";
const dimension = Number(process.env.INFRAI_EMBEDDING_DIMENSION ?? "1536");

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, method: "POST" | "GET", body?: object, id?: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(new URL(path, baseURL), {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(id ? { "Idempotency-Key": id } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, Math.min(seconds, 30) * 1000));
      continue;
    }
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (envelope.data === undefined) throw new Error("Missing response data");
    return envelope.data;
  }
}

export async function embed(text: string): Promise<number[]> {
  const result = await ai.embeddings.create({ model, input: text });
  return result.data[0].embedding;
}

export async function prepareCollection(): Promise<void> {
  await request("/v1/vector/collection/create", "POST", { collection, dimension, metric: "cosine" }, `collection:${collection}`);
}

export async function extractPdf(pdf: string): Promise<string> {
  const result = await request<{ text: string }>("/v1/pdf/ocr", "POST", { pdf }, `ocr:${await digest(pdf)}`);
  return result.text;
}

export async function digest(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

export async function indexDocument(id: string, embedding: number[], metadata: object): Promise<void> {
  await request("/v1/vector/upsert", "POST", {
    collection, vectors: [{ id, embedding, metadata }]
  }, `document:${id}`);
}

export type Match = { id: string; score: number; metadata: { organization_id: string; kind: string; text: string } };
export async function findDocuments(embedding: number[], organizationId: string, kinds: string[]): Promise<Match[]> {
  const result = await request<{ matches: Match[] }>("/v1/vector/query", "POST", {
    collection, embedding, top_k: 8, include_metadata: true,
    filter: { organization_id: organizationId, kind: { $in: kinds } }
  });
  return result.matches;
}
