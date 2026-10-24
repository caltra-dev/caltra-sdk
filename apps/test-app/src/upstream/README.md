# Standard assistant-ui Thread demo

These 25 source files are from assistant-ui commit
`79e5919d8c9c72bd4697c672f0f228c2a62edec4` (`@assistant-ui/react` 0.15.30),
using its Base UI variants. `provenance.json` records every original path.
The downloaded registry Thread matched this pinned source exactly.

Thread, message layout, action bars, tool grouping, composer, and supporting UI
are upstream source, not CaltraMessage. Source adaptations: `lib/utils.ts` replaces upstream's monorepo `cn` package
with the existing clsx/tailwind-merge helper; MarkdownText imports the equivalent
`unstable_memoizeMarkdownComponents` name exported by the installed Markdown package.
Imports resolve through the demo's `@` alias. See LICENSE.

The separate `/thread.html` entry uses the upstream template's Tailwind theme
with local source scanning and system fonts. It does not import the Signal Room's
global CSS. No SDK consumer needs these demo-only dependencies.

Caltra's existing runtime adapter supplies the same deterministic history in both
comparison modes. The demo supplies complete tool parts because plain Thread does
not use Caltra's lazy tool-details wrapper. No live Caltra session or Piria record
is accessed. Switching modes preserves history; each layout owns its composer draft.
This is a presentation experiment, not adoption or production integration proof.
