# Runtime-owned sessions implementation plan

**Goal:** Piria provisions a hosted runtime for its authenticated user and opens sessions beneath that runtime without creating Caltra agents.

**Architecture:** A runtime is the session's durable parent. Tenant principals authorize runtime access and session membership; they are not session containers. Browser routes and SDK methods require a runtime ID for session creation and stable lookup. Existing runtime and conversation identities are retained where possible.

**Tech stack:** TypeScript, Fastify, PostgreSQL, Caltra SDK, React, TanStack Router, Relay.

1. Caltra API: expose server hosted-runtime get/create and browser hosted-runtime lookup. Authenticate server credentials and resolve active tenant membership before provisioning. Use an advisory transaction lock to prevent duplicate personal runtimes. Add a runtime provisioning scope.
2. Caltra sessions: add runtime-scoped creation/lookup under `/runtimes/:runtime_id/sessions`, enforce hosted owner and model eligibility, and scope external-ID uniqueness to runtime. Extend browser reads to agentless sessions without widening downscoped credentials. Test repeat/concurrent creation, separate runtimes, and cross-user denial.
3. SDK: add server and browser runtime clients and runtime-bound session collections. Represent runtime ownership in session documents. Cover exact serialization and error handling; validate consumers against packed SDK artifacts on Sprite.
4. Piria: replace agent provisioning with runtime provisioning and resolve `primary` beneath that runtime. Preserve the existing organization membership gate. Verify no agent endpoint is called.
5. Caltra UI/API: expose runtime on session summaries; show a runtime link instead of an agent on session detail and session list. Add URL-owned Members tab backed by paginated, authorization-scoped membership records (including inherent owner access and explicit writer/viewer grants with expiry/revocation status). Reuse that definition for counts in the runtime sessions table and link counts to the tab.
6. Seed representative agentless runtime sessions and memberships. Run API, SDK, and web checks on isolated Sprites; verify responsive pages and member navigation. Commit validated changes and hand off private preview URLs. Keep preview/worktrees until user validation, then delete Sprites and merge into each main checkout before removing worktrees.

Production deployment and npm publication are separate release operations; record artifact versions and exact remaining release steps in the handoff.
