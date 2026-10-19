# `@caltra/react`

Ready-to-use Caltra chat with scoped standard styling, plus a headless assistant-ui runtime.
The styled entry point is available starting in **0.9.0**.

## Styled chat

Install the styled chat and its peer dependencies:

```bash
npm install @caltra/client@0.8.3 @caltra/react@0.9.0 @assistant-ui/react@0.15.16 react react-dom
```

```tsx
import { CaltraChat } from "@caltra/react/ui";
import type { CaltraClient } from "@caltra/client";

export function Assistant({ client, sessionId }: { client: CaltraClient; sessionId: string }) {
  return <div style={{ height: "100dvh" }}><CaltraChat client={client} sessionId={sessionId} /></div>;
}
```

The `@caltra/react/ui` entry automatically imports its scoped CSS through your application's
CSS-capable bundler. No separate stylesheet import, Tailwind, shadcn setup, copied component
source, or host CSS reset is required. The explicit `@caltra/react/styles.css` export remains
available for compatibility. The headless `@caltra/react` entry does not import CSS. The defaults
include a welcome, loading skeleton, Markdown transcript, copy icon with checkmark feedback and localized accessible labels/tooltips, scroll-to-bottom button,
text composer, connection recovery and retry. Enter sends; Shift+Enter inserts a newline.
Use `submitMode="ctrlEnter"` or `"none"` to change keyboard submission.

History is unknown until the first successful response. Only confirmed empty history displays
the welcome. Recovery retains loaded messages; changing the client or session resets the chat.
Keep the same client instance for the same authenticated identity. Keep the component mounted
and use `hidden` when collapsing a panel to retain its draft and connection.

## Themes and color mode

`CaltraChat` defaults to `theme="assistant-ui"` and `colorMode="system"`. The assistant-ui
preset uses the neutral light/dark palette and text-chat composition of assistant-ui's
standard Thread, adapted to Caltra's supported actions and scoped CSS. `ocean` is a second
Caltra preset with blue accents. Neither requires a stylesheet import.

```tsx
<CaltraChat client={client} sessionId={sessionId} theme="ocean" colorMode="dark" />
```

`colorMode` accepts `light`, `dark`, or `system`. System follows the browser's
`prefers-color-scheme`, including changes while mounted. CSS resolves the palette before
hydration; switching modes or themes does not reconnect, reload history, or clear a draft.
Theme scope is one chat, so multiple chats can use different appearances on the same page.
The surrounding application chooses its own color mode independently.

Create reusable custom themes from typed tokens:

```tsx
import { createCaltraTheme, caltraThemes } from "@caltra/react/themes";

const brand = createCaltraTheme({
  name: "brand",
  radius: "0.75rem",
  light: { accent: "#9a3412", accentForeground: "#ffffff" },
  dark: { accent: "#fdba74", accentForeground: "#431407" },
}, caltraThemes["assistant-ui"]);

<CaltraChat client={client} sessionId={sessionId} theme={brand} colorMode="system" />
```

Omitted tokens inherit from the chosen base; defaults are immutable. Colors include
`background`, `foreground`, `muted`, `mutedForeground`, `accent`, `accentForeground`, `border`,
and `error`. `fontFamily`, `radius`, and `contentWidth` apply to both modes. The themes entry
contains only data/types/helpers and does not import CSS. Existing `--caltra-*` CSS overrides
still take precedence; a fixed override applies in both modes, so use theme tokens for
mode-specific branding. `labels` and component slots remain independent of appearance.

## Customize

```tsx
<CaltraChat client={client} sessionId={sessionId}
  labels={{ welcomeTitle: "Come posso aiutarti oggi?", placeholder: "Scrivi un messaggio…" }}
  style={{ "--caltra-accent": "#1d4ed8", "--caltra-radius": "0.75rem" }} />
```

`labels` accepts every built-in visible and accessible label; use `CaltraChatLabels` for a complete
translation. Theme variables include `--caltra-background`, `--caltra-foreground`,
`--caltra-muted`, `--caltra-muted-foreground`, `--caltra-accent`, `--caltra-accent-foreground`,
`--caltra-border`, `--caltra-error`, `--caltra-font-family`, `--caltra-content-width`, and
`--caltra-radius`. CSS is scoped to `.caltra-chat`; `className` is also supported.

Replace presentation with stable component references:

```tsx
function Welcome() { return <h2>Ask about your project</h2>; }
<CaltraChat client={client} sessionId={sessionId} components={{ Welcome }} />
```

Available slots: `Welcome`, `Loading`, `Message`, `Composer`, `Connection`. Each receives the
resolved labels and renders inside the assistant-ui provider. The composer also receives
`submitMode`; connection receives `connection`, `error`, `historyLoaded`, and `retry`.
The default components are exported as `CaltraWelcome`, `CaltraHistoryLoading`, `CaltraMessage`,
`CaltraComposer`, and `CaltraConnection`.

## Headless runtime

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useCaltraRuntime } from "@caltra/react";
import type { CaltraClient } from "@caltra/client";

export function CustomChat(props: { client: CaltraClient; sessionId: string }) {
  const { runtime, historyLoaded, connection, error, reconnect } = useCaltraRuntime(props);
  return <AssistantRuntimeProvider runtime={runtime}>
    {/* Render your assistant-ui thread. runtime.thread.getState().isLoading remains
        true until history is known; a failed request must not render a welcome. */}
  </AssistantRuntimeProvider>;
}
```

The result also exposes `refresh()` for history reconciliation. `reconnect()` retries transport
without clearing loaded history. Headless imports need no stylesheet. Caltra owns a linear
transcript; pending IDs becoming persisted IDs do not create edit/regeneration branches.

Authentication belongs to `@caltra/client`. Create authorization codes in your authenticated
backend using `@caltra/server`; never expose a server API key in browser code. See the
[repository guide](../../README.md) and `apps/test-app` for the full integration.

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
scroll anchoring, keyboard navigation or touch input. The styled UI loads the scrollbar rules automatically. Import `scrollbar.css` explicitly
when using your own components; it has no React dependency
at runtime.

## Tool calls

The styled chat uses Assistant UI's upstream `ToolFallback`, vendored from the
release matching our installed runtime. It shows a compact collapsed tool row
with a status icon; expanding it reveals arguments, results, and available errors.
The SDK bundles scoped styling for light/dark themes, so no Tailwind setup is required.
Opening a tool's details never executes or retries it.

Replace it with `components={{ Tool: MyToolRenderer }}`. This slot receives
assistant-ui `ToolCallMessagePartProps`. The upstream default is also exported
as `CaltraTool`. It retains upstream English labels; use the custom slot for
localized tool presentation. The existing tool label fields remain available to
custom renderers. See [source provenance](src/ui/assistant-ui/README.md).

Client 0.8.3 opts in to structured tool history and tool-start events. Deploy the matching
Caltra API support before publishing this client version; older clients keep their existing
text-only wire format. The API exposes public tool arguments/results, never raw model metadata
or reasoning. A successful copy uses assistant-ui's standard three-second checkmark feedback.
