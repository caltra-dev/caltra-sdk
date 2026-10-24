# Thinking dropdown

Approved: replace the horizontal Thinking segments with assistant-ui’s documented dropdown composition. Preserve the existing model list, trigger, theme, allowed-choice catalog, and native ModelContext registration.

Implementation: copy the pinned upstream Base UI menu, scope its portal to the existing theme host, expose Content children through the high-level selector, and render a radio menu using useModelSelectorEfforts. Stop menu keyboard events from reaching cmdk. No API or dependency upgrade is included.

Validation: run demo typecheck/build and demo plus adapter tests on the existing Sprite. Exercise all seven choices, nested keyboard navigation, next-send selection, and narrow layouts in the extension when available. Browser checks are currently blocked by extension timeouts; do not merge before preview acceptance.

Version audit (2026-10-24): SDK lockfile uses @assistant-ui/react 0.15.30 and react-markdown 0.14.12; npm latest is 0.15.31 and 0.14.24. Copied selector source differs from current upstream only by the shared-state refactor; upstream still documents horizontal effort overflow.

Results: Sprite demo typecheck/build passed; all 15 demo tests and 8 adapter tests passed. The seven-effort component test verifies available options, selected value, model-list isolation, and Escape returning to the outer popup. Desktop/mobile rendered geometry and real browser interactions remain blocked after two Chrome extension timeouts. No browser E2E suite ran; user preview acceptance is pending.
