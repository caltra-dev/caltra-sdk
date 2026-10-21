# Session runtime and assistant-ui adapter implementation plan

**Goal:** Separate framework-neutral session state from assistant-ui, support supplied runtimes in CaltraChat, and preserve readers' scroll position.

**Architecture:** Move CaltraSessionStore into @caltra/client as CaltraSessionRuntime. Add @caltra/assistant-ui as the React adapter. Keep @caltra/react's existing hook and store exports compatible. CaltraChat owns only runtimes created from client/sessionId; supplied runtimes remain caller-owned.

**Tech stack:** TypeScript, React, assistant-ui 0.15.16, Vitest, Playwright, private Fly Sprites.

## 1. Regression coverage and isolated environment
- Create a branch Sprite using the documented provisioner. Transfer an exact tracked working-tree snapshot for pre-commit validation.
- Add runtime ownership and adapter sharing tests, plus a browser test that reads older history while message/tool starts arrive.
- Verify the scroll test fails against the old default before applying the fix.

## 2. Core session runtime
- Move packages/react/src/session_store.ts to packages/client/src/session_runtime.ts and move its tests to packages/client/tests/session_runtime.test.ts.
- Add CaltraClient.createSessionRuntime({ sessionId }) and export runtime/state/transport types. Preserve subscribe/getSnapshot/start/stop/reconnect/send/cancel contracts.
- Keep the historical store name as a deprecated re-export. No React dependency in core.
- Guard async completion against stopped/replaced connections and test ownership.

## 3. assistant-ui adapter
- Create packages/assistant-ui with useAssistantUiRuntime(sessionRuntime), mapping state/actions without owning transport lifetime.
- Keep useCaltraRuntime({ client, sessionId }) as a compatibility wrapper that owns its session runtime.
- Test two adapters using one runtime and unmount behavior.

## 4. Chat integration and scrolling
- Accept a discriminated union of runtime or client/sessionId; keep identity changes atomic and presentation updates stable.
- Subscribe to supplied runtimes without starting/stopping them. Start/stop only internally created runtimes.
- Expose typed viewport options and composer input options; keep structural children under component slots. Keep public runtime access via slots and upstream hooks.
- Disable scrollToBottomOnRunStart by default, retaining initial history positioning, bottom-follow, and explicit jump-to-bottom.
- Public events currently expose message lifecycle, not authoritative run completion. Do not invent whole-run state from message boundaries; document that limitation separately.

## 5. Deterministic preview and documentation
- Add an explicit runtime demo to the test app with saved history and repeatable streamed message/tool steps. Exercise managed, caller-owned, and custom assistant-ui modes without production data.
- Update package READMEs with lifecycle ownership, supported capabilities, import examples, default scrolling, and migration guidance.

## 6. Verification and handoff
- Run builds, type checks, affected unit tests and browser regressions on the Sprite. Verify tracked source parity with the local worktree.
- Commit validated changes; deploy committed HEAD via sprite-dev up. Validate the private preview using the browser extension.
- Provide URL and review steps. Wait for user preview acceptance before merging into main; then delete Sprite before removing the merged worktree.
