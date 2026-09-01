# Test App Success Toast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Confirm authoritative session creation through one accessible, collision-safe application toast while preserving the returned session as durable UI state.

**Architecture:** Add a small application-owned React provider/host that owns notification state, deduplication, timeout lifecycle, accessibility semantics, and measured header placement. Route only the post-`createSession` success path through its typed API, and exercise the contract with deterministic Playwright API mocks.

**Tech Stack:** React 19, TypeScript, Vite, CSS, Vitest, Playwright

---

### Task 1: Add deterministic create-session browser coverage

**Files:**
- Create: `apps/test-app/e2e/session_creation.spec.ts`
- Modify: `apps/test-app/playwright.config.ts`

**Step 1: Add a mock Client API harness**

Intercept `/api/client-token`, agent/session listing, session creation, message listing, and event-stream calls. Hold the create response behind a test-controlled promise so the test can distinguish activation from authoritative completion.

**Step 2: Write failing authoritative-ordering and durable-state assertions**

Assert no status announcement while the POST is pending. After resolving it, assert one concise success toast, one new session rail entry, the created agent as the selected chat heading, and no success banner or duplicate page copy.

**Step 3: Write failing notification lifecycle and accessibility assertions**

Assert a persistent polite atomic status container, no focus movement, manual dismissal, finite auto-dismissal, hover/focus pause, deduplication, a 44-pixel dismiss target, and reduced-motion behavior.

**Step 4: Write failing placement assertions**

Across `360x800`, `390x844`, `430x932`, `768x1024`, and desktop, assert no document overflow, no shell geometry shift, and no overlap with marked header controls. Assert wide header-center placement and force a collision to assert immediate below-bar fallback, safe-area-aware constraints, and pointer-safe overlay behavior.

**Step 5: Run the focused tests and confirm failure**

Run: `npm run test:e2e --workspace=@caltra/test-app -- session_creation.spec.ts`

Expected: FAIL because the toast API, host, semantics, and placement do not exist.

### Task 2: Implement the application-owned success notification API and host

**Files:**
- Create: `apps/test-app/src/components/success_toast.tsx`
- Modify: `apps/test-app/src/main.tsx`
- Modify: `apps/test-app/src/components/chat.tsx`
- Modify: `apps/test-app/src/styles.css`

**Step 1: Add the typed provider API**

Implement `SuccessToastProvider` and `useSuccessToast`. Keep one active notification, bound remembered operation IDs, use one shared timeout, preserve remaining time through hover/focus pauses, and expose manual dismissal.

**Step 2: Add the persistent accessible host**

Render one persistent polite atomic `role="status"` region without moving focus. Render concise visual copy and an accessible dismiss button only while a notification is active.

**Step 3: Add measured collision-safe placement**

Measure the header and its occupied regions with `ResizeObserver`, recomputing on resize. Center within the navigation viewport when it fits; otherwise place immediately below the bar. Apply safe-area-aware width/offsets and pointer-event containment.

**Step 4: Integrate the provider at the composition root**

Wrap `App` once in `main.tsx`, mark the chat header/occupied regions, and style the host without changing header height or content flow. Disable entry motion under reduced-motion.

**Step 5: Run the focused tests**

Run: `npm run test:e2e --workspace=@caltra/test-app -- session_creation.spec.ts`

Expected: placement/lifecycle tests remain failing only because the create path does not emit yet; host-level assertions pass.

### Task 3: Emit exactly one post-authoritative session-created toast

**Files:**
- Modify: `apps/test-app/src/app.tsx`
- Test: `apps/test-app/e2e/session_creation.spec.ts`

**Step 1: Route the success path through the shared API**

After `client.createSession` resolves, schedule the returned session into the durable list and selection, then call `success` with `create-session:${session.id}` and concise copy. Do not retain success text in component state.

**Step 2: Run the focused browser suite**

Run: `npm run test:e2e --workspace=@caltra/test-app -- session_creation.spec.ts`

Expected: PASS with authoritative ordering, exactly-one emission, durable state, lifecycle, accessibility, and placement coverage.

### Task 4: Verify, audit, and integrate

**Files:**
- Review all changed files

**Step 1: Run full verification**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e --workspace=@caltra/test-app`

Expected: all unit, type, build, and browser checks pass; the credentialed live smoke remains skipped when its environment is absent.

**Step 2: Audit the diff for private data and scope**

Run: `git diff --check && git diff --name-only && git diff | rg -n "(CALTRA_API_KEY=|client_token.{0,20}[A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9_-]{12,}|BEGIN .*PRIVATE KEY|password|secret)" || true`

Expected: no whitespace errors, no generated/ignored artifacts, and no private values or credentials.

**Step 3: Commit the verified branch**

Run: `git add -A && git commit -m "feat(test-app): confirm session creation with toast"`

**Step 4: Merge into local main and clean up**

Fast-forward local `main` to the verified feature commit, verify `main`, remove `.worktrees/success-toasts`, and delete the merged feature branch. Rollback is the single merge commit's inverse; there are no migrations, server behavior changes, background jobs, telemetry changes, new runtime secrets, or recurring costs.
