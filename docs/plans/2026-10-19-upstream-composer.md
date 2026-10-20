# Upstream composer and cancellation implementation plan

**Goal:** Repair the identified stale records and adopt upstream assistant-ui composer controls with real cancellation, without changing turn/message lifecycle reconciliation.

**Architecture:** The client API exposes the existing authorized cancellation transaction. The SDK adds a typed cancel call and connects assistant-ui onCancel to it. Caltra owns the upstream composer markup and scoped upstream styles; Piria uses defaults. No change to running-state derivation or worker completion logic.

**Tech stack:** TypeScript, Fastify, PostgreSQL, React, assistant-ui 0.15.16, Vitest and Playwright on isolated Sprites.

1. Repair only the 12 reviewed message IDs in production session 8c41356e-8789-496b-adbc-5e86b09a5391, guarded by matching tenant/session and completed parent turn. Verify count and remaining stale rows; preserve content and all active turns.
2. Add POST /client/v1/sessions/:session_id/cancel using messages:create, signed tenant context, session ownership, active-session and agent restrictions. Reuse cancelTurn and its cancellation outbox. Tenant users are not platform users: pass null to the existing nullable platform actor column. No schema or worker changes.
3. Add CaltraClient.cancelSession and SDK store.cancel/onCancel; refresh authoritative history after cancellation and preserve errors. Keep existing isRunning calculation unchanged.
4. Use the pinned upstream Composer layout and Send/Cancel components, tooltip, icons, sizing, focus and keyboard semantics. Retain SDK full-panel loading geometry and text-only support; unsupported attachment/voice controls stay absent.
5. Add API authorization/idempotence tests, SDK cancel/error/reconnect tests, and Piria browser scenarios for repaired saved history, Enter/click sending, Shift+Enter, send/stop transitions, successful/failed cancellation and reconnect. Existing fixtures require no production data.
6. Validate and commit all repos. Present a private Piria preview plus backend cancellation verification. Wait for user review before merging, publishing SDK/client, bumping Piria dependencies, or deploying.

**Known limitation:** Because lifecycle changes are excluded, future stale streaming records can recur. This task repairs existing data, not the producer of stale state.

## Validation

SDK client: 14 tests passed. React adapter/UI: 20 tests passed, including cancellation failure/retry and repaired history after reconnect. Both packages built; React typecheck passed. Piria browser suite: 8 tests passed on Sprite Node 24.18, including native 28px controls, matching skeleton/loaded bounds, Enter/click/Shift+Enter, stop/retry and reconnect. No Piria presentation overrides.

Before publication, bump the client package and the React dependency minimum together so cancelSession is available to every consumer. Publish the server endpoint first.

## Live integration review

The private Piria preview exercised Enter submission, native 28px controls and Stop against the isolated Caltra API. Database verification confirmed turn `317d6bc7-9ff0-447c-b9f5-cdead57415d9` became cancelled with user_requested, null platform actor, and completed user/cancelled assistant messages. Stop restored Send. Existing cancellation deletes stream events, so uncheckpointed partial text can disappear after the authoritative refresh; this behavior remains unchanged under the explicit no-lifecycle-fix boundary. The UI fixture also covers cancellation when partial text is durably available.
