# ADR 0004: Retrieval is Postgres full-text search, not embeddings

- Status: Accepted. Recorded 21 October 2026.
- Supersedes: none.

## Context

"Ask Prepo" has to find the transcript lines that answer a question, then answer
with citations. The default instinct is an embedding index and a vector store.
That adds an embedding provider, a second index to keep in sync, a chunking
policy, and a similarity threshold that is hard to explain when it returns the
wrong passage. The corpus is team-sized: one workspace's transcripts, meetings
and tickets, which fit in a model's context once the obviously irrelevant parts
are removed.

## Decision

Postgres does the retrieval, and the model only reads the passages it is given.

- A trigger (`transcript_segments_tsv`) maintains `transcript_segments.tsv` with
  `to_tsvector('english', text)`, and a GIN index covers it.
- The query is `websearch_to_tsquery('english', $question)`, ranked by
  `ts_rank`, limited to 20 segments. `websearch_to_tsquery` is used because it
  accepts what a person types (quoted phrases, `or`, `-term`) without a query
  language to learn.
- Around the matched segments, the prompt gets the twelve most recent meeting
  summaries and up to forty tickets. Every passage carries a token (`s1`, `m1`,
  or the ticket key), and the answer must cite those tokens.
- Citations that do not match a sent passage are dropped and counted; a non-zero
  count means the answer is not trusted.
- Caps: 500 characters per question, 300 Ask runs per workspace per month, all
  counted from `ai_runs` (purpose `ask_workspace`).
- The question itself is not stored: the `ai_runs` row has a null `traceId`.

## Consequences

- A question phrased in words the transcript never used will not find the
  passage. There are no synonyms, no stemming across languages, and no semantic
  match. The UI's "no sources" answer says to use the words that were actually
  used, which is the honest instruction rather than an apology.
- `pg_trgm` is installed best-effort and a trigram index exists, but the query
  does not use `similarity()`: typo tolerance is **not** implemented in the
  retrieval path, only the index is in place for a later one. `PREPO.md` 1.3's
  "trigram similarity" line is the specification's intent, not the current
  query.
- The fast-model query rewrite in the specification was not built, so
  `AI_MODEL_FAST` is unread. The question goes to Postgres as typed.
- Ranking is cheap and explainable: an operator can paste the same query into
  `psql` and see the same rows, which a vector index cannot offer.
- Adding embeddings later is a change behind `searchTranscript`, not a change
  to the answer contract.

## Alternatives considered

- **pgvector plus an embedding model.** Rejected for this size: another
  provider, another key, another index, and a quality claim the project has no
  eval to support (evals are not built, see ADR 0010).
- **Send every transcript to the model.** Rejected: unbounded cost and latency,
  and it makes the cap meaningless.
- **A hosted search service.** Rejected: the workspace boundary is already in
  Postgres, and exporting transcripts to a second store would need its own
  tenant isolation review.

## Evidence

`apps/web/drizzle/policies/002_search.sql`,
`apps/web/src/server/db/repo.ts` (`searchTranscript`),
`apps/web/src/server/ai/ask.ts` (`DEFAULT_ASK_LIMITS`, passage tokens, citation
check), `apps/web/src/server/ai/prompt.ts`, `db:ai-smoke` (56 checks),
`db:injection-smoke`.
