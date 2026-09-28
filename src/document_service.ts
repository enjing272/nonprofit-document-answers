import { createServer } from "node:http";
import { z } from "zod";
import { allowedKinds, mayRead } from "./document_policy.ts";
import { digest, embed, extractPdf, findDocuments, indexDocument, InfraiError, prepareCollection } from "./infrai_documents.ts";

const ingest = z.object({
  organization_id: z.string().min(1),
  kind: z.enum(["receipt", "reminder", "report"]),
  document_id: z.string().min(1),
  pdf: z.string().min(1)
}).strict();
const ask = z.object({
  organization_id: z.string().min(1),
  audience: z.enum(["finance", "volunteer", "campaign"]),
  question: z.string().min(1)
}).strict();

async function readBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 12_000_000) throw new RangeError("Body too large");
  }
  return JSON.parse(body);
}

if (process.argv.includes("--setup")) {
  await prepareCollection();
  console.log("Collection ready");
} else {
  createServer(async (request, response) => {
    const send = (status: number, value: object) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.method !== "POST" || !["/documents", "/questions"].includes(request.url ?? "")) {
      send(404, { error: "Unknown route" });
      return;
    }
    try {
      const body = await readBody(request);
      if (request.url === "/documents") {
        const input = ingest.parse(body);
        const text = await extractPdf(input.pdf);
        const id = await digest(`${input.organization_id}:${input.document_id}`);
        await indexDocument(id, await embed(text), {
          organization_id: input.organization_id, kind: input.kind, text
        });
        send(200, { document_id: input.document_id, indexed: true });
      } else {
        const input = ask.parse(body);
        const matches = await findDocuments(await embed(input.question), input.organization_id, allowedKinds(input.audience));
        const evidence = matches.filter(match =>
          match.metadata.organization_id === input.organization_id &&
          mayRead(input.audience, match.metadata.kind as "receipt" | "reminder" | "report")
        ).map(match => ({ document_id: match.id, score: match.score, excerpt: match.metadata.text.slice(0, 600) }));
        send(200, { question: input.question, evidence });
      }
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) send(400, { error: "Invalid request body" });
      else if (error instanceof RangeError) send(413, { error: error.message });
      else if (error instanceof InfraiError) send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, message: error.message });
      else send(502, { error: error instanceof Error ? error.message : "Request failed" });
    }
  }).listen(Number(process.env.PORT ?? 3000), () => console.log("Document service listening"));
}
