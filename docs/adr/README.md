# Architecture decision records

Each record states one decision the code actually makes, the reasons it beat the
alternatives, and what it costs. They are not proposals: where the built system
differs from `PREPO.md`, the record says which one is in force and links to the
evidence in the repository.

An ADR is added when a decision would be expensive to reverse or when a future
reader is likely to ask "why not the obvious thing?". It is edited only to
correct it; a reversal gets a new record that supersedes the old one.

| # | Decision | Status |
|---|---|---|
| [0001](0001-tenant-isolation-in-postgres-rls.md) | Tenant isolation lives in PostgreSQL row-level security, not in query filters | Accepted |
| [0002](0002-pglite-workbench-postgres-by-url.md) | PGlite for the workbench, Postgres when `DATABASE_URL` is set | Accepted |
| [0003](0003-row-and-a-pass-instead-of-a-workflow-engine.md) | Durable work is a row plus a scheduler-invoked pass, not Inngest | Accepted |
| [0004](0004-full-text-retrieval-without-embeddings.md) | Retrieval is Postgres full-text search, not embeddings | Accepted |
| [0005](0005-audio-behind-a-storage-driver.md) | Audio bytes live behind a storage driver, on disk | Accepted |
| [0006](0006-model-returns-json-server-writes.md) | The model returns JSON; the server decides what to write | Accepted |
| [0007](0007-integration-secrets-encrypted-outside-the-database.md) | Integration secrets are encrypted with a key the database does not hold | Accepted |
| [0008](0008-desktop-shell-with-no-window-capabilities.md) | The desktop shell gets no window capabilities | Accepted |
| [0009](0009-no-realtime-channel-yet.md) | No realtime channel in the built app; IDs-only if one is added | Accepted |
| [0010](0010-ci-is-the-enforcement-point.md) | CI is the enforcement point, not the demo | Accepted |

`ARCHITECTURE.md` is the map that these records sit under; `SECURITY.md` maps
the same system to the OWASP checklist.
