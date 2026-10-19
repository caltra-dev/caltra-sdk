# Chat themes implementation plan

**Goal:** Ship a standard assistant-ui appearance with scoped, customizable themes, system/light/dark modes, and a new interactive preview.

**Architecture:** Keep session/runtime ownership unchanged. Export immutable preset data and a typed theme factory from `@caltra/react/themes`. Resolve color mode in CSS using `prefers-color-scheme`, so the first paint is correct without reading browser globals during SSR. Public CSS variable overrides take precedence over preset values. The UI entry imports its styles automatically; the headless entry stays CSS-free.

**Tech stack:** React, assistant-ui 0.15.16 primitives, TypeScript, scoped CSS, Vitest and Playwright on Sprite.

1. Add `packages/react/src/themes/index.ts` with complete light/dark color tokens, assistant-ui and ocean presets, shape/type defaults, and `createCaltraTheme` partial overrides. Export through package metadata.
2. Update `src/ui/chat.tsx` and `styles.css` to accept `theme` and `colorMode`, apply scoped variables without remounting, match upstream text-chat composition, and preserve existing CSS/slot customization. Include the scrollbar stylesheet from the UI entry; preserve its standalone export.
3. Update the demo Chat controls for theme, color mode and language. Wrap controls responsively and preserve existing session/draft state.
4. Add meaningful browser coverage for initial system mode, live OS changes, forced modes, custom light/dark values, independent chat scopes, and draft/history/scroll retention. Retain existing loading, long-history, and scrollbar tests.
5. Update package/demo README and Caltra public SDK guide. Verify package exports, typechecks, unit tests, optimized build and browser tests on a fresh private branch Sprite. Exercise real deterministic-provider commands and reload in Chrome. Commit validated changes and hand off the new preview for user acceptance before merging.

## Upstream boundary

The assistant-ui preset follows the neutral shadcn palette and text-chat layout from the upstream Thread registry. Caltra adapts the supported subset to its runtime and scoped CSS: explicit history readiness, localized labels, copy/send/scroll controls, Markdown and recovery. It is not an unmodified copy of the full upstream Thread, which also contains unsupported voice/attachment/regeneration controls. Source reference: assistant-ui/assistant-ui commit `79e5919d8c9c72bd4697c672f0f228c2a62edec4`, `apps/docs/registry` Thread registry as served by https://r.assistant-ui.com/thread.json on 2026-10-19. Preserve this distinction in public documentation.

## Tool and copy follow-up

User requested real tool rendering and seeded capabilities during preview review. Add opt-in structured `tool_calls` history and `tool.started` SSE with only public call identity, preserving older strict clients. Correlate results within the same tenant, workspace, session and turn. Map this contract to assistant-ui tool parts and provide a collapsible fallback plus a Tool slot. Seed read, echo (brief running state), and intentional failure examples under development configuration. Verify three-second upstream copy feedback, tool success/failure/running states, responsive themes, and durable reload through real provider commands.
