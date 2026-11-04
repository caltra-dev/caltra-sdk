# Native assistant-ui Thread source

The source is pinned to assistant-ui commit
`79e5919d8c9c72bd4697c672f0f228c2a62edec4` (`@assistant-ui/react` 0.15.30),
using its Base UI variants. `provenance.json` records original paths; see LICENSE.
This is the single presentation tree used by the SDK and Signal Room.

Thread owns message layout, action bars, tool grouping, the composer, loading
skeleton, pending dot, reserve space and scrolling. CaltraChat supplies the runtime,
theme/locale providers, connection feedback, and lazy tool/reasoning adapters.

Integration adaptations to retain when refreshing source:

- Package-relative ESM imports, the existing clsx/tailwind-merge helper, and the
  Markdown package's exported `unstable_memoizeMarkdownComponents` alias.
- Typed English/Italian labels and explicit caller label overrides. Provider text,
  protocol values and tool results are never translated.
- Optional UserMessage, Loading, Composer and ComposerControls slots; viewport,
  input and root-style forwarding for existing explicit CaltraChat options. Native
  defaults remain in place when these options are absent.
- Exported default components for compatibility slots and lazy reasoning composition.
- Per-chat tooltip/dialog portal containers; model popovers and dropdowns accept
  their owning container through context. No document-global chat query.
- The previously approved omission of Reload and Export as Markdown from the
  assistant action bar. Copy and capability-gated feedback remain native.
- ModelSelector forwards disabled, aria-label and custom effort content while
  preserving native ModelContext registration. The demo uses the documented
  effort dropdown composition.

The SDK compiles Tailwind utilities and preflight and scopes them to `.caltra-chat`
with CSS `@scope`. Consumers need no Tailwind build. Host theme variables and a
1rem inset outside the scrollport are separate from the native Thread source.

The standalone `VoiceConversation` and `range` elements were imported
from the official assistant-ui element registry on 2026-11-03
(`https://r.assistant-ui.com/elements-voice-conversation.json` and dependencies).
They reuse the existing surfaces helpers and package-relative ESM paths. Caltra supplies media state through
props; this does not replace the existing text runtime with a voice runtime.
The optional `showStatusText` adaptation preserves the native default while Caltra
uses a dot-only visual state with an accessible status announcement. During Live,
Caltra hides the mounted text thread and restores it when the call ends.
The optional `fullSize` adaptation fills that conversation area without the card
surface, lets the live transcript scroll, and keeps call controls visible below it.
