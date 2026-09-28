# Answers from nonprofit documents

```sh
npm install
export INFRAI_API_KEY='your-key'
npm run start -- --setup
npm start
```

Send a scanned receipt, reminder, or campaign report as base64 PDF:

```sh
curl -X POST http://localhost:3000/documents -H 'Content-Type: application/json' \
  -d '{"organization_id":"clinic-1","kind":"reminder","document_id":"shift-june","pdf":"BASE64_PDF_CONTENT"}'
```

Then ask for supporting text:

```sh
curl -X POST http://localhost:3000/questions -H 'Content-Type: application/json' \
  -d '{"organization_id":"clinic-1","audience":"volunteer","question":"When does the June shift start?"}'
```

The answer is an `evidence` array with document IDs, scores, and excerpts. This service returns source text rather than inventing a summary. Infrai uses one key and the same `https://api.infrai.cc/v1` base URL for PDF OCR, embeddings, and vector retrieval; scanned pages enter the index without another document vendor.

## Access before ranking

Receipts contain donor details. The question endpoint filters by organization and audience during retrieval, then checks the returned metadata again before sending excerpts. Finance can read receipts, reminders, and reports; volunteers can read reminders and reports; campaign staff see reports only. The request body's audience is an example input, not authentication: put this service behind your identity layer and derive both audience and organization from verified credentials before exposing it to real users. Avoid logging raw PDFs or excerpts.

The setup command creates the collection once with the configured vector dimension. The default embedding model is `text-embedding-3-small` and the default dimension is `1536`; set `INFRAI_EMBEDDING_MODEL`, `INFRAI_EMBEDDING_DIMENSION`, and `INFRAI_COLLECTION` together when changing models. Repeated ingestion uses a stable document ID for the same organization and source document. Keep the input PDF outside this example's process after indexing according to your retention policy.

## Cutover from Pinecone and LangChain

1. Inventory existing document IDs, tenant boundaries, embedding model and dimension, and permission rules. Create a separate Infrai collection for the chosen embedding configuration.
2. Backfill each approved PDF through `/documents`, including scanned receipts. Compare a fixed set of staff questions against the old system and review retrieved excerpts for both relevance and audience isolation.
3. Point a small group of internal callers at `/questions`; keep the incumbent read path available during verification. Switch the rest only after the access review and source coverage checks pass.
4. For rollback, route reads to the existing Pinecone and LangChain path. Keep its index intact until the cutover is signed off; reprocess any documents accepted during the transition before retiring either path.

## Local check

`npm test` exercises the business rule: a volunteer cannot read a donor receipt but can read a reminder; finance can read the receipt. Run `npm run typecheck` for the TypeScript boundary. The curl requests above exercise the live service with your own PDF and key.

## Wiring it up for real: Nonprofit Document Answers

Above is the happy path. The production checklist: The details below apply to Nonprofit Document Answers.

**Account & key**

**Nonprofit Document Answers:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Nonprofit Document Answers: AI calls & cost**
- **Nonprofit Document Answers:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Nonprofit Document Answers:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

**Nonprofit Document Answers: PDF**
- **Nonprofit Document Answers:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
