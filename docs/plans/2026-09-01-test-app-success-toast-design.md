# Test App Success Toast Design

## Intent

The test app must confirm session creation only after `CaltraClient.createSession` returns an authoritative session. The returned session remains the durable evidence: it is inserted into the session rail and becomes the selected chat. The confirmation itself is transient and must not become page, form, card, or route state.

## Chosen approach

Add one application-owned React notification provider and host in `apps/test-app`. The provider exposes a narrow `success({ operationId, message })` API. It owns one active notification, a bounded operation-ID deduplication set, the shared finite timeout, and pause/resume/dismiss behavior. The persistent host owns the polite atomic live region and visual presentation. `App` calls the API exactly once, after the create request resolves and after scheduling the returned session as durable UI state.

This is preferred over adding a toast package because the app has no component-system dependency and only needs one success notification contract. It is preferred over a module-global event emitter because context makes ownership, lifecycle, and tests explicit. No stack exception is required: the implementation stays in the application-owned UI boundary and does not introduce another primitive system.

## Placement and interaction

The host measures the top chat header and its marked left/right occupied regions. When the toast fits in the header's horizontal center without intersecting either occupied region, it is fixed over that unused center and does not affect layout. If it cannot fit, it is fixed immediately below the header. The same calculation reruns for notification changes, viewport changes, and element resizes. Safe-area insets constrain the toast's width and below-bar offset.

The notification layer ignores pointer input except for the visible toast. The dismiss control is at least 44 by 44 CSS pixels. Hovering the toast or focusing within it pauses the remaining timeout; leaving or blurring resumes it. Showing a toast never moves focus. Motion is limited to a brief entry transition and is disabled by `prefers-reduced-motion`.

## Accessibility and verification

The host keeps a persistent `role="status"`, `aria-live="polite"`, `aria-atomic="true"` container. Concise success text is announced after authoritative completion. The updated session rail and chat header preserve equivalent durable confirmation.

Playwright will mock the token and Client API boundaries so create-session behavior is deterministic without credentials. Tests will hold the POST unresolved to prove there is no early toast, resolve it to prove exactly one toast and durable state, verify no persistent success copy, manual and timed dismissal, hover/focus pause, deduplication, focus preservation, pointer-safe layering, header-center placement, forced collision fallback, safe-area CSS, reduced motion, and the supported `360x800`, `390x844`, `430x932`, `768x1024`, and desktop viewports. The full repository test, typecheck, build, and Playwright suites remain the release gate. No analytics, secrets, tokens, IDs, or response payloads are added to notification text.
