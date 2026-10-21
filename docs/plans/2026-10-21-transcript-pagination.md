# Transcript pagination and concurrent startup

**Goal:** Show a bounded recent transcript after opening its live subscription, while retaining live updates and making older messages available on demand.

**Architecture:** Caltra's API already returns the newest page in chronological order with an older-page cursor. The React session store owns fetching and merging; Piria continues to use the shared CaltraChat component. Open and consume the stream first, then fetch history and metadata concurrently. Initial page size is 20.

**Tech stack:** Existing TypeScript client, React, assistant-ui, Vitest, and private Sprite validation.

## Evidence and limits

- The affected production session contains 101 stored messages: 54 visible user/assistant messages and 47 tool-result messages (read-only database counts). A limit of 100 therefore fetches the entire visible transcript.
- Browser waterfall: organization GraphQL 1.051s; preparation details 0.692s; authorization 1.996s; initial transcript with tools and limit=100 17.386s; metadata 0.226s. History completes 22.578s after navigation. Later history fetches took 18.758s and 35.461s.
- Sampled Piria traces independently show preparation detail 0.549s and authorization 1.530s. These samples have not been correlated to the exact browser requests.
- Direct Tempo access is now available on Caltra local main. Trace `6a2ed55dfbb91516fdd8cad879365cfe` records 17,542ms for message history, including a final PostgreSQL query of 17,295.586425ms (98.6%). The preceding query takes 216.950961ms; 13 earlier query spans each take 0.87–3.35ms. SQL text and concrete session IDs are not recorded, so this is route-level evidence, not a proven exact browser-request match or definitive RLS diagnosis.

## Implementation

1. Add session-store regressions for history resolving while the stream connection remains pending, live messages arriving before history, identity deduplication, stale responses, older-page cursor consumption, retry and reconnect preservation.
2. Change `packages/react/src/session_store.ts` to request 20 messages and retain the cursor, expose bounded `loadOlder`, and merge by ID without replacing newer streamed state. Prevent concurrent duplicate page requests. Inspect the server's persistence/stream overlap contract before choosing the exact merge rule; do not infer text overlap by matching repeated strings.
3. Expose pagination in `packages/react/src/use_caltra_runtime.tsx` and the shared UI in `packages/react/src/ui/chat.tsx`, with localized labels and stable loading/error states. Preserve scrolling when earlier messages are prepended.
4. Document the contract in `packages/react/README.md`, add a representative deterministic long-history development scenario, and validate in Sprite. Keep tracked sources identical between worktree and Sprite.
5. Use the real SDK in a Piria branch preview. Exercise opening a long preparation transcript, reading older pages, concurrent stream updates, reconnect and keyboard interaction. Provide the preview URL and expected results for user acceptance before merge and cleanup.

## Validation status

- Superseded implementation/validation detail is recorded in [lazy transcript tools](2026-10-21-lazy-transcript-tools.md).
- Pagination now lives in the framework-neutral `CaltraSessionRuntime` in `packages/client` after rebasing onto the current runtime separation and running-state fixes.
- Initial history is requested only after opening/consuming the stream, closing the snapshot gap with one bounded initial read. Seven pagination regressions pass in the 53-test SDK suite.
- The development runtime demo has 36 deterministic messages and saved successful/failed tool calls. It paginates to 20 initially and fetches simulated details on expansion; no production data is seeded.
- Browser interaction was not run per the user's CLI-only instruction. User preview review is pending; do not merge or delete the task worktrees/Sprite before acceptance.
- No package publication or production deployment.
