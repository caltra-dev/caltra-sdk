# UI conventions

This entry point covers the maintained `apps/test-app` demo and the consumer-facing UI integration in `packages/react`. It does not apply UI requirements to backend SDK packages or prescribe the UI of applications consuming the SDK.

## Shared guidance

Use the installed **agent-native-saas-stack** skill. The following paths are relative to its discovered root:

- Ownership: `references/convention-ownership.md`.
- Demo interactions, feedback, responsive behavior, and accessibility: `references/frontend/ui-conventions.md`.
- General web components: `references/languages-frameworks/shadcn-ui.md` and `references/languages-frameworks/base-ui.md`.
- If adding routed demo screens: `references/languages-frameworks/tanstack-router.md`.

## Local sources

- [React adapter integration contract](../../packages/react/README.md) owns the consumer-facing presentation boundary and assistant-ui integration.
- [Test app setup](../../apps/test-app/README.md) owns the demo's integration setup.

## Historical context

The [success-toast design record](../plans/2026-09-01-test-app-success-toast-design.md) and its [implementation plan](../plans/2026-09-01-test-app-success-toasts.md) record an earlier change, not current UI conventions or approved exceptions. In particular, the earlier bespoke-toast rationale does not waive the shared component-layer rules. No exception is adopted by this documentation migration, and existing code has not been certified against the shared baseline.
