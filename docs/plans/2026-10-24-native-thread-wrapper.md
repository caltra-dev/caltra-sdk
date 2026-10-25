# Native Thread wrapper implementation plan

**Goal:** Replace both CaltraChat's duplicate presentation and the demo comparison
with one pinned native assistant-ui Thread, as explicitly requested by the user.

**Architecture:** Move the existing pinned upstream source from the demo into the
React SDK. CaltraChat owns session/provider lifecycle, theme/locale configuration,
connection feedback, and lazy resource adapters. Native Thread owns its default
layout, welcome/loading states, composer, message grouping, indicators and scroll.

**Tech stack:** React, assistant-ui 0.15.30, existing pinned Base UI components,
Tailwind 4.3.3 compiled during SDK build and scoped to the owning chat host.

1. Move the upstream tree and provenance to `packages/react/src/ui/upstream`;
   rewrite imports to package-relative paths and expose shared Thread/model controls.
   Use a scoped portal context for multiple chat instances.
2. Bundle compiled native CSS in the existing styled SDK entry. Keep host theme
   variables and explicit CSS overrides; consumers need no Tailwind build or reset.
3. Make CaltraChat a provider/adapter wrapper. Preserve public client/runtime,
   labels, theme, hidden, submitMode, input/viewport props and custom component slots.
   Add optional Thread slots/prop forwarding without changing default native markup.
   Default scrolling/loading/grouping changes to native behavior intentionally.
4. Reuse native tool fallback/reasoning primitives for lazy Caltra data. Preserve
   canonical resource IDs and expand-only fetch. Remove superseded duplicate UI.
5. Demo renders CaltraChat only, with the model controls in the native composer.
   Remove the view switch and demo-owned Thread/style copy. Retain locale/theme,
   real/stub connection, model selection and thinking diagnostics.
6. Validate behavioral tests (loading, send/stop, lazy tools/reasoning, custom slots,
   themes/hidden draft retention and history), typechecks and build on branch Sprite.
   Check the packaged CSS and native grouped tool count. Commit the validated change.
7. Preview and Chrome-extension checks through the existing verification chat:
   stub thinking/tools, real streaming, model popup/theme/locale, scroll/reload and
   cancellation. Keep Sprite/worktree until user accepts this separate migration.

No server changes, migrations or production publication are included. Existing
native styling/behavior is retained; custom slots affect only explicit callers.
