# Automatic history pagination

Approved scope: CaltraChat loads older pages near the top of its native assistant-ui viewport, with a compact skeleton and explicit retry after a failure. No backend or consumer setup changes.

Implementation:
1. Add an optional LoadEarlier integration slot to the vendored Thread, retaining its native default.
2. Supply a Caltra-owned sentinel through that slot. Observe the owning viewport with a 256px top margin; call the native runtime's loadEarlier operation. Keep pagination cursors, request deduplication, message identity, and prepend anchoring with their existing owners.
3. Stop automatic attempts on error, expose native keyboard-accessible retry, and retain a manual fallback when IntersectionObserver is unavailable. Disconnect observers on unmount/session switch and ignore queued stale callbacks.
4. Test automatic loading, in-flight deduplication, exhaustion, error/retry, and observer cleanup in Sprite. Run React tests, type checks, and builds there.
5. Preview the committed branch in its own Sprite. Verify real browser scrolling and stable message position when extension access is available. Keep the preview/worktree until review, without modifying the concurrent voice preview.
