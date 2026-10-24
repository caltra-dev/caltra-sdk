# Thread Localization Implementation Plan

**Goal:** Enable English and Italian in Signal Room's standard Thread while retaining upstream components and runtime behavior.

**Architecture:** A typed, demo-owned dictionary and React locale context supply labels to the vendored assistant-ui components. Locale updates preserve component identity, drafts, runtime subscriptions, and disclosure state. UI translations never alter messages, tool names, API payloads, approval IDs or server-provided text.

**Tech Stack:** Existing React, TypeScript, assistant-ui Thread and Base UI. No new dependency.

1. Extract the existing Italian CaltraChat labels for reuse; add English/Italian Thread strings including accessible names, plural counts and dynamic filenames.
2. Replace fixed presentation strings in Thread and supporting components. Keep protocol constants and provider content untouched. Pass locale through SignalThread and enable Language without a locale-dependent key.
3. Update provenance/setup documentation and existing browser regression scenarios. Typecheck/build and run the existing demo tests on the Sprite. Use the browser extension to check English/Italian, draft retention, Copy/tool/reasoning labels, streaming and mobile layout. Commit validated changes and refresh the existing private preview; await user validation before merge.

## Validation

Sprite typecheck, production build and 12 demo/API tests passed. Browser-extension checks confirmed Italian composer/actions/history/tool/reasoning labels, draft retention across both language changes, disclosure state retention, an uninterrupted streamed turn, and mobile wrapping. Existing Playwright scenarios were updated but not executed, honoring the browser-extension-only instruction. Real API history was also checked; message content stays unchanged. Preview acceptance remains pending.
