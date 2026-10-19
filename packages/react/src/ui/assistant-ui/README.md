# Assistant UI ToolFallback provenance

`tool-fallback.tsx`, `collapsible.tsx`, and `button.tsx` are vendored from
[assistant-ui commit 75e3ef71beb5dc99f6fc624624d3d61b307c8599](https://github.com/assistant-ui/assistant-ui/tree/75e3ef71beb5dc99f6fc624624d3d61b307c8599/packages/ui/src),
the `@assistant-ui/react@0.15.16` release used by this SDK. See `LICENSE`.

`CaltraTool` adapts the durable per-call lifecycle to upstream `status` props;
otherwise assistant-ui 0.15.16 treats even an error result as completed.

The ToolFallback component logic and markup are unchanged; imports point to local
modules. The supporting Base UI components are the upstream Base UI variants.
The class-name helper uses clsx and tailwind-merge, as upstream does.

The SDK ships scoped CSS equivalents of the upstream utility styling in
`../styles.css`. This keeps consumer apps free of Tailwind configuration and
maps colors to Caltra theme tokens. Long unbroken values wrap on narrow panels.
The default renderer keeps upstream English labels; replace `components.Tool`
for localized tool presentation. Existing Caltra tool label fields are retained
for custom renderers but no longer control the default fallback.

When updating, compare against the matching upstream release, review the source
and its dependencies, update this pin and license, and recheck keyboard expansion,
scroll lock, running/error/cancelled states, reduced motion, light/dark mode,
and narrow panels. Do not redesign the upstream fallback in this boundary.
