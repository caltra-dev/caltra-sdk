# `@caltra/react`

React adapter that exposes a durable Caltra session as an assistant-ui external-store runtime. It supplies the runtime integration, not presentation components.

## Install

```bash
npm install @caltra/client @caltra/react @assistant-ui/react react react-dom
```

## Use

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useCaltraRuntime } from "@caltra/react";
import type { CaltraClient } from "@caltra/client";

export function CaltraSession(props: { client: CaltraClient; sessionId: string }) {
  const { runtime } = useCaltraRuntime(props);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Render assistant-ui thread components here. */}
    </AssistantRuntimeProvider>
  );
}
```

The package is ESM-only and requires `@caltra/client`. See the [Caltra SDK repository](https://github.com/caltra-dev/caltra-sdk) for a complete local integration application.

Authentication belongs to `@caltra/client`. Its default same-origin authorization route can be
installed with `@caltra/server/fastify`, then the resulting client is passed to this adapter.

Caltra owns the linear transcript supplied to assistant-ui. The adapter replaces the message repository when history changes, so pending IDs that become persisted IDs do not create edit/regeneration branches. Streaming and terminal message statuses remain explicit.

## Optional native scrollbar theme (since 0.8.3)

Version 0.8.3 adds an explicitly imported stylesheet; importing the runtime hook
alone does not load CSS. It changes only elements with `caltra-scrollbar` or
`caltra-chat__viewport`, with no global reset or JavaScript scroll handlers:

```tsx
import "@caltra/react/scrollbar.css";

<ThreadPrimitive.Viewport className="caltra-scrollbar">
  {/* Your existing thread content */}
</ThreadPrimitive.Viewport>
```

The default is a thin, rounded native thumb in light gray on a transparent track.
It uses `--caltra-border` when provided. Hover darkens it slightly; focusing the
composer does not darken the scrollbar. The browser/OS controls native visibility
and exact geometry. Forced-color mode uses system colors.

Set variables on the viewport or an ancestor, or override the zero-specificity
rules with your own CSS class. No `!important` is needed:

```css
.my-chat {
  --caltra-scrollbar-thumb: var(--input-border, #d4d4d8);
  --caltra-scrollbar-thumb-hover: #bfc0c7;
  --caltra-scrollbar-track: transparent;
  --caltra-scrollbar-width: thin;
  --caltra-scrollbar-size: 8px;
}

/* Alternatively, retain the browser's default appearance for one viewport. */
.my-native-viewport {
  scrollbar-width: auto;
  scrollbar-color: auto;
}
```

`--caltra-scrollbar-width` accepts the native `auto`, `thin`, or `none` keywords.
Keep a visible scroll affordance where needed; `none` hides the scrollbar.
`--caltra-scrollbar-size` controls width/height only in older WebKit browsers
without the standard properties. The theme does not alter overflow, layout,
scroll anchoring, keyboard navigation or touch input. Use `scrollbar.css` together
with your own components or an optional packaged UI; it has no React dependency
at runtime.
