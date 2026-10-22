# Earlier History Implementation Plan

**Goal:** Upgrade assistant-ui to 0.15.30 and load older Caltra messages when the reader scrolls near the top.

**Architecture:** CaltraSessionRuntime retains cursor ownership, deduplication, and recoverable errors. The adapter supplies `hasEarlier` and `onLoadEarlier`; assistant-ui owns loading state and viewport anchoring. CaltraChat triggers the native loader near the top, reuses the existing loading indicator, and offers native LoadEarlier as Retry after failure.

**Tech Stack:** TypeScript, React, assistant-ui 0.15.30, Vitest, Playwright, Sprite.

1. Upgrade the adapter, React package, and test app dependencies and peer floors. Resolve the lockfile on the branch Sprite.
2. Wire the adapter in `packages/assistant-ui/src/index.tsx`; test native state, concurrent requests, and exhausted history.
3. Replace the custom button and scroll-height correction in `packages/react/src/ui/chat.tsx`. Add loading copy; test top-scroll activation, hidden chat, error recovery, and callback composition.
4. Make the in-memory demo page at 20 rows with visible delay and an optional next-page failure. Demonstrate native earlier-history access in its custom adapter mode.
5. Update integration documentation. Run all SDK unit tests, typechecks, builds, and browser history/scroll checks on Sprite; verify prepend anchoring at desktop and mobile sizes, including a concurrent streamed turn.
6. Commit and deploy the exact branch revision to a private Sprite. Present the preview for user validation before merging or publishing.

Browser validation also exposed a cursor race during the first earlier-page request: an overlapping streamed-history refresh could reset its boundary and repeat a page. Preserve the in-flight boundary on overlap; retain cursor replacement for a real reconnect gap, with regression tests for both cases. Keep loading feedback out of transcript layout so a fast scroll cannot trigger bottom-follow through a resize.
