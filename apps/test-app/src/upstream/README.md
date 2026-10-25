# Standard assistant-ui Thread demo

These 26 source files are from assistant-ui commit
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
dialog portals target this panel to inherit its scoped styles. English/Italian presentation strings use the demo-owned `lib/thread-i18n.tsx` context; common Italian labels are shared with CaltraChat. Locale changes preserve component identity. Keep these calls when refreshing upstream source; protocol constants and provider content are not translated. The exported AssistantMessage lets the demo
compose a Caltra lazy-reasoning disclosure through the upstream AssistantMessage slot. No SDK consumer
needs these demo-only dependencies.

Caltra's runtime adapter supplies the same session to both comparison views.
The demo can use its local HTTP API stub or a real Caltra connection, selected in Signal Room when the server starts with a key. Switching views preserves history; each layout owns its composer draft.
See the [demo setup](../../README.md) for connection modes and credential handling.

The pending assistant indicator retains the upstream pulsing dot.

ModelSelector and its shared model-selection utility, command and popover components use the same pinned upstream commit. Import paths are adapted to this source tree. The high-level selector additionally forwards `disabled` and `aria-label` to its trigger so the demo can prevent changes during a turn and give the combined control an accessible name. Its native ModelContext registration is retained.

The demo-owned `ComposerControls` slot inserts ModelSelector into the existing Thread composer action row. Keep this small extension when refreshing upstream source; it does not replace the managed Thread, input, or send/stop controls. Selection state is held above both views so moving between the header and composer retains the selected model and effort.

ModelSelector uses the upstream default presentation without trigger/content class overrides or demo-specific selector CSS. Popover accepts the owning theme container through context so its portal inherits the same Tailwind reset and theme tokens as its trigger. The header host uses the same UI theme scope; it does not supply a separate selector palette.

The demo replaces the horizontal Effort segments with the documented `useModelSelectorEfforts` dropdown composition. The high-level ModelSelector forwards optional children into Content, retaining its native ModelContext registration and hidden keyboard focus anchor. The copied Base UI dropdown-menu comes from the same pinned source; its portal uses the owning theme container. Menu key events do not bubble into the surrounding cmdk model list. ModelSelector trigger, popup, and model-list presentation remain stock.
