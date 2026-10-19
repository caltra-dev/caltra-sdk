# Ready-to-use React chat implementation plan

**Goal:** Ship a styled, accessible Caltra chat with correct history lifecycle and optional customization, demonstrated against a real session.

**Architecture:** Keep the existing runtime hook as the headless integration. Add optional `@caltra/react/ui` exports and a scoped CSS stylesheet for the default chat, built with assistant-ui primitives. History readiness belongs to the session store and is propagated to every integration, not inferred from message count or connection state.

**Tech stack:** Existing React 18/19, assistant-ui 0.15.16, TypeScript, Vitest, and Playwright. Markdown uses assistant-ui's maintained Markdown renderer.

## 1. History lifecycle

- Add an explicit history-loaded signal to `packages/react/src/session_store.ts`; only successful history fetches establish an empty conversation. Reconnects preserve loaded history. Reject late updates from stopped lifecycle generations.
- Expose readiness through `packages/react/src/use_caltra_runtime.tsx` and assistant-ui `isLoading`; key the default component's internal runtime by session identity so session switches cannot flash the previous session.
- Add regression tests with unresolved history, confirmed empty results, reconnects, initial failure, and stop/switch races.

## 2. Packaged UI

- Add `CaltraChat` in `packages/react/src/ui/`, plus optional loading, welcome, message, composer, and connection components. The default UI includes message formatting, Copy, scroll-to-bottom, text input, Enter/Shift+Enter behavior, accessible status/error feedback, and only supported actions.
- Provide English default labels and partial localized labels, CSS custom properties, root class/style, and typed component slots. Custom components stay under the assistant-ui runtime provider. Styling is optional to the headless entry point and requires no Tailwind setup in consumer apps.
- Add a CSS package export, mark CSS as a package side effect, and verify built/packed file paths.

## 3. Real demo

- Replace hand-built chat in `apps/test-app/src/components/chat.tsx` with the packaged UI. Preserve session selection and real authorization. Show default styling first; demonstrate localized/theme customization without a second runtime.
- Provision a branch Sprite through existing GitVaulty-managed development configuration. Run checks there and validate the actual browser response and reload of a durable session. Keep preview for user review.

## 4. Documentation and discovery

- Update the SDK README with minimal styled integration, stable client identity, lifecycle, localization, slots, theme variables, and headless escape hatch.
- In the Caltra application repository, update `/docs/react-chat-ui` to match implemented exports, and add a shared external Docs link to desktop/mobile app navigation including admin shell. Preserve application state by opening the separate public site in a new tab.
- Public docs must identify the required unreleased SDK version until publication is separately verified; do not imply current npm availability.

## Validation

Run SDK unit tests, typechecking, builds, package-content verification, and demo browser tests on the Sprite. Verify responsive layout and keyboard submission. Verify the real session independently of mocked tests. Run Caltra web typechecking and landing build/tests for docs/navigation. No npm publication or production deployment is included; keep branch previews and commits pending user validation before merging.

## Validation record

- Initial delayed-history regression failed against the old runtime (loading was false), then passed with explicit history readiness.
- SDK workspace checks passed: 90 unit tests, all workspace typechecks/builds, and package dry-run including `dist/ui/styles.css` and the typed UI entry point.
- Nine Playwright browser checks passed, including delayed existing history at 360px and 1280px, Markdown, Shift+Enter, theme/draft preservation, responsive composer placement, and the existing toast checks.
- The real demo authenticated against an isolated Caltra API using its seeded local key and displayed its persisted two-message dogfood transcript. Chrome also verified Italian/theme switching preserved the transcript and draft.
- The original seed had no model route. The combined preview now uses Caltra's deterministic development provider: Chrome verified echo, authorized capability discovery/loading/execution, rejection of an ungranted update, and saved history after restart, without an LLM. The production-key configuration initially available to the demo returned `invalid_api_key` and was not changed.
- The SDK branch remains unreleased. Publication, consumer upgrades, and user preview acceptance are outstanding; the Piria application's separate auth-object memoization issue is not changed by this SDK branch.

The long-history browser regression reproduced page overflow at both 360px and 1280px: absolutely positioned hidden role labels escaped the chat scroll container. Each message now establishes their positioning context. The regression checks document height, outer-page scroll, inner chat scrolling, and composer visibility with 40 saved messages.
All 11 browser checks passed on the Sprite after this fix, including both long-history regressions. The live Chrome preview also reported document height equal to viewport height and zero outer-page scroll with the real tool transcript.
