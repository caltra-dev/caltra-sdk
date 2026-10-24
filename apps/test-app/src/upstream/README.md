# Standard assistant-ui Thread demo

These 25 source files are from assistant-ui commit
`79e5919d8c9c72bd4697c672f0f228c2a62edec4` (`@assistant-ui/react` 0.15.30),
using its Base UI variants. `provenance.json` records every original path.
The downloaded registry Thread matched this pinned source exactly.

Thread, message layout, action bars, tool grouping, composer, and supporting UI
are upstream source, not CaltraMessage. Source adaptations: `lib/utils.ts` replaces upstream's monorepo `cn` package
with the existing clsx/tailwind-merge helper; MarkdownText imports the equivalent
`unstable_memoizeMarkdownComponents` name exported by the installed Markdown package.
The demo omits Reload and the Export as Markdown menu from the assistant action bar; Copy and capability-gated feedback remain.
Imports resolve through the demo's `@` alias. See LICENSE.

Signal Room embeds Thread as a selectable view. Tailwind preflight is scoped to
`.signal-thread`; theme tokens are mapped from the shared controls. Tooltip and
dialog portals target this panel to inherit its scoped styles. Language remains English-only. The exported AssistantMessage lets the demo
compose a Caltra lazy-reasoning disclosure through the upstream AssistantMessage slot. No SDK consumer
needs these demo-only dependencies.

Caltra's runtime adapter supplies the same session to both comparison views.
The demo can use its local HTTP API stub or a real Caltra connection, selected at
server launch. Switching views preserves history; each layout owns its composer draft.
See the [demo setup](../../README.md) for connection modes and credential handling.
