# `@caltra/react`

Ready-to-use Caltra chat with scoped standard styling, plus a headless assistant-ui runtime.
The styled entry point is new in **0.9.0 (not published yet)**.

## Styled chat

After 0.9.0 is published:

```bash
npm install @caltra/client@0.8.2 @caltra/react@0.9.0 @assistant-ui/react@0.15.16 react react-dom
```

```tsx
import { CaltraChat } from "@caltra/react/ui";
import "@caltra/react/styles.css";
import type { CaltraClient } from "@caltra/client";

export function Assistant({ client, sessionId }: { client: CaltraClient; sessionId: string }) {
  return <div style={{ height: "100dvh" }}><CaltraChat client={client} sessionId={sessionId} /></div>;
}
```

No Tailwind, shadcn setup, copied component source, or host CSS reset is required. The defaults
include a welcome, loading skeleton, Markdown transcript, copy icon with checkmark feedback and localized accessible labels/tooltips, scroll-to-bottom button,
text composer, connection recovery and retry. Enter sends; Shift+Enter inserts a newline.
Use `submitMode="ctrlEnter"` or `"none"` to change keyboard submission.

History is unknown until the first successful response. Only confirmed empty history displays
the welcome. Recovery retains loaded messages; changing the client or session resets the chat.
Keep the same client instance for the same authenticated identity. Keep the component mounted
and use `hidden` when collapsing a panel to retain its draft and connection.

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
