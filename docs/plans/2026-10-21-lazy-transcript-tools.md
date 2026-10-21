# Lazy transcript tools implementation plan

**Goal:** Load a 20-message transcript with lightweight tool summaries and fetch arguments/results only when expanded, preserving tenant authorization and assistant-ui components.

**Architecture:** Add `include_tools=summary` alongside the legacy full-detail opt-in. Summaries contain call ID/name/status only. A scoped message/tool endpoint returns details on demand. Replace repeated lateral database scans with a materialized, tenant-scoped result set; all paths retain tenant_client RLS. The SDK owns detail request deduplication/cache, invalidated when a running tool changes state. A thin Caltra renderer composes existing ToolFallback parts and fetches on first open; upstream files stay unchanged.

**Tech stack:** Existing TypeScript, Fastify, PostgreSQL RLS, Caltra SDK and assistant-ui 0.15.16.

## Tasks

1. Add summary/detail contracts and scoped GET route in `apps/api/src/client_sessions/{api,openapi,service,message_interface,tool_projection}.ts`; update generated-document definitions in client_auth/openapi.ts. Preserve full-detail clients and enforce messages:read plus current session access. Reject mismatched session/message/tool with 404.
2. Optimize `tool_projection.ts` so result rows are read once with MATERIALIZED CTEs. Summaries select only identifiers, name and status. Keep newest-result ordering and turn boundaries. Default message page becomes 20. Add meaningful tenant-role integration coverage and inspect EXPLAIN ANALYZE for first-load and detail queries; no production mutations.
3. Rebase the existing SDK pagination work onto main's CaltraSessionRuntime. Start/consume the stream before historical fetch, deduplicate events/messages, retain authoritative turn running state and prevent stale responses overwriting newer state. Page size 20 with load-older anchors.
4. Add client summary/detail methods, runtime detail cache and React composition using existing ToolFallback.Root/Trigger/Content/Args/Result. No upstream component changes. Loading and retry appear in the panel; terminal status remains visible without a downloaded result. Handle session changes, pending requests, running-to-terminal invalidation and overlapping opens.
5. Add API/SDK regression tests and deterministic >20-message development fixtures with completed, failed, running and missing-result tools. Test API tenant boundaries, older pages, request counts, caching, errors and lifecycle updates. Execute tests/builds on a task-owned isolated Sprite with tracked sources synchronized.
6. Commit validated changes and provide the combined preview plus explicit manual test steps. User requested CLI-only work: use CLI verification and do not interact with a browser. State that interactive user validation is pending; preserve worktree/Sprite until acceptance. No package publication or production deployment.

## Verified incident

The tenant-role tool query reproduced at 17,131.897 ms. Its 62 lateral result scans caused 6,262 content index probes and repeated RLS checks. A materialized-result diagnostic returned identical 62 rows/fields in 653.673 ms; simply limiting to 20 visible messages still took 4,758.651 ms. All experiments were read-only. The final implementation must optimize the summary path as well as defer detail payloads.

## Validation (2026-10-21)

- API TypeScript check passed on Sprite; 47 selected API tests passed on an isolated PostgreSQL 17 cluster, including actual tenant-client RLS, newest retry selection, reused call ID in a different turn, cursor behavior and revoked group membership.
- SDK client/adapter/React type checks passed; 52 selected SDK tests passed on Sprite, covering lazy opening, terminal status, retries/cache, lifecycle invalidation, pagination, streaming overlap, reconnect and running state.
- React package and test app build/type check passed. Browser interaction was intentionally not run, per the user's CLI-only instruction. User preview acceptance remains required.
- Final read-only production-data EXPLAIN: 20 messages, 17 payload-free tool summaries; message/text query 152.290 ms, summary query 360.158 ms, total 512.448 ms. A single detail query took 293.255 ms. These are database timings, not deployed HTTP latency.
- Startup establishes and consumes the subscription before fetching history, avoiding a duplicate initial snapshot and closing the subscription/snapshot gap.
- No upstream assistant-ui component files changed. No production application deployment, package publication, permission or schema changes.
