# Test App Success Toast Design

**Status:** Historical design record (2026-09-01). Current guidance starts at the [UI convention entry point](../ui/README.md).

## Original rationale

The change introduced session-creation confirmation in the test application. At the time, the app had no component-system dependency and needed only one success-notification path, so the design chose a small React context provider rather than adding a toast package or a module-global event emitter. The reason for context was explicit application ownership, lifecycle, and testability.

This records the original choice, not a standing exemption from the shared shadcn/ui and Base UI component rules. The original claim that no stack exception was required is not an approved exception under the current ownership contract.

## Current owners

The installed **agent-native-saas-stack** skill owns feedback and interaction requirements at these paths relative to its discovered root:

- `references/frontend/ui-conventions.md#confirm-successful-actions-without-occupying-page-content`
- `references/frontend/ui-conventions.md#responsive-web-and-mobile-conventions`
- `references/frontend/ui-conventions.md#accessibility-quality-gate`
- `references/frontend/ui-conventions.md#verification`

Implementation details belong to the [notification implementation](../../apps/test-app/src/components/success_toast.tsx) and [browser coverage](../../apps/test-app/e2e/session_creation.spec.ts). The [original implementation plan](2026-09-01-test-app-success-toasts.md) remains historical context; its API names and verification steps describe that change.
