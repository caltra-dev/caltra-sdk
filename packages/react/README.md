# `@caltra/react`

Ready-to-use Caltra chat with scoped standard styling, plus a headless assistant-ui runtime.
The styled entry point is available starting in **0.9.0**.

## Styled chat

Install the styled chat and its peer dependencies:

```bash
npm install @caltra/client @caltra/react @assistant-ui/react@0.15.30 react react-dom
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
include a welcome, skeleton-only loading state (the loading label is screen-reader-only), Markdown transcript, copy icon with checkmark feedback and localized accessible labels/tooltips, scroll-to-bottom button,
upstream text composer, connection recovery and retry. Enter sends; Shift+Enter inserts a newline.
While a turn runs, the native Stop control calls `CaltraClient.cancelSession`, then reloads persisted history. A failed cancellation preserves the running state and exposes the existing error alert; Stop can be retried. HTTP cancellation also works while the event stream reconnects. Running-state presentation follows the persisted queued/running turn on current servers, including pauses between messages and tools. Older servers retain the legacy message-activity fallback.
Initial loading uses the native history skeleton. The native composer is centered
for a confirmed empty conversation and docked for an existing transcript. Bootstrap integrations may render
`CaltraHistoryLoading` inside the SDK's `caltra-chat` root to use the same presentation.
Markdown uses the upstream assistant-ui `MarkdownText` component, including heading
hierarchy, paragraph/list/blockquote spacing and the standard code-copy header. The
SDK bundles its styling; consumers need no Markdown or Tailwind overrides.
Use `submitMode="ctrlEnter"` or `"none"` to change keyboard submission.

History is unknown until the first successful response. Only confirmed empty history displays
the welcome. Recovery retains loaded messages; changing the client or session resets the chat.

Transcript startup opens and begins consuming the session event stream before fetching the
latest 20 messages and session metadata. This subscription-before-snapshot order closes the
startup gap without a duplicate initial history request. Events continue to be consumed while
history is pending. History merges by message ID, stream events deduplicate by event ID,
and completed canonical text replaces provisional text without appending it twice.
HTTP reconciliation never blocks consumption of subsequent events.

The native **Load earlier messages** control requests one cursor page. Assistant-ui
owns loading state and anchoring while messages are prepended. Failures show sanitized
feedback; use the same native control to retry. There is no automatic traversal of
older cursors on mount or scroll. The headless result exposes `hasOlderMessages`,
`loadingOlder`, `olderError`, and `loadOlder()`. Explicit `loadOlder` and `olderLoading`
labels override the native control, while `olderFailed` customizes error feedback.

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

## Native Thread

CaltraChat is a session/provider wrapper around the pinned native assistant-ui Thread,
shared with the demo. Thread owns the welcome/loading states, composer, pending dot,
message layout, action bars, grouping, and scrolling. Consecutive backend assistant
steps are projected into one response before Thread groups its content. Copy appears
after the full response, tool calls are disclosed through native count groups, and
older history loads with the native **Load earlier messages** button.

The SDK bundles scoped Tailwind output, including preflight inside each chat only.
Consumers need no Tailwind configuration. Themes and explicit CSS overrides map
onto native tokens; native fixed sizes remain native. A host inset keeps the pinned
turn clear of the enclosing header.

For advanced composition, `@caltra/react/ui/thread` exports the pinned Thread and
its types, default components and locale providers. Supply AssistantRuntimeProvider
and a `.caltra-chat` host when using it directly. `@caltra/react/ui/model-selector`
exports the native selector and its effort-composition parts; its portal container
should be inside that host. CaltraChat supplies these providers automatically.

## Customize

```tsx
<CaltraChat client={client} sessionId={sessionId}
  labels={{ welcomeTitle: "Come posso aiutarti oggi?", placeholder: "Scrivi un messaggio…" }}
  style={{ "--caltra-accent": "#1d4ed8", "--caltra-radius": "0.75rem" }} />
```

`locale="en" | "it"` translates native Thread controls. Explicit `labels` override
matching native controls and Caltra connection/resource feedback; legacy label fields
remain available to custom slots. Native actions retain their own structure and states. Theme variables include `--caltra-background`, `--caltra-foreground`,
`--caltra-muted`, `--caltra-muted-foreground`, `--caltra-accent`, `--caltra-accent-foreground`,
`--caltra-border`, `--caltra-error`, `--caltra-font-family`, `--caltra-content-width`, and
`--caltra-radius`. CSS is scoped to `.caltra-chat`; `className` is also supported.

Replace presentation with stable component references:

```tsx
function Welcome() { return <h2>Ask about your project</h2>; }
<CaltraChat client={client} sessionId={sessionId} components={{ Welcome }} />
```

Available slots: `Welcome`, `Loading`, `Message`, `Composer`, `Connection`, `Tool`,
`Reasoning`, and `ComposerControls`. The last inserts controls inside the native composer. Each receives the
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
as `CaltraTool`. Native tool labels follow `locale`; legacy tool label fields remain
available to custom renderers. See [source provenance](src/ui/upstream/README.md).

React 0.12.0 with client 0.11.0 requests `include_tools=summary` for history: tool ID, name
and status arrive with the page, while arguments/results are omitted. Opening the default tool
card calls `getSessionToolDetails(sessionId, messageId, toolCallId)` once. The session runtime
caches and deduplicates requests per call/lifecycle state, retries failed reads, and refreshes
details when a running call becomes terminal. The panel uses upstream ToolFallback parts;
their presentation stays native. Closing/reopening a completed call reuses its cached details.
While details load, the panel shows a mini spinner with an accessible loading label.
The custom `components.Tool` slot remains caller-owned; headless integrations can use
`runtime.getToolDetails(messageId, toolCallId)`. `CaltraToolCall.arguments` is optional on
summary pages. A tool's displayed status does not depend on downloading its result.

Deploy the API supporting summary pages and the scoped detail endpoint before publishing
this SDK change. Legacy `include_tools=true` still returns full details.

Client 0.8.3 originally opted in to structured tool history and tool-start events. Deploy the matching
Caltra API support before publishing this client version; older clients keep their existing
text-only wire format. The API exposes public tool arguments/results, never raw model metadata
or reasoning. Copy follows the entire response and copies text only, never tool
arguments or results. Native action bars control visibility during streaming and
on hover; Copy is disabled for a tool-only response. Successful copying shows the
native three-second checkmark.

## Session runtime integration (0.11.0)

There are two mutually exclusive sources for `CaltraChat`:

```tsx
// Chat creates, starts, and stops its own session runtime.
<CaltraChat client={client} sessionId={sessionId} />

// Caller creates and starts this runtime; chat only observes it.
const runtime = client.createSessionRuntime({ sessionId });
await runtime.start();
<CaltraChat runtime={runtime} />
// Owner calls await runtime.stop() when all consumers are done.
```

Do not create the supplied runtime during every render. Use a stable owner, useMemo, or a keyed component with useState. Unmounting a chat supplied with `runtime` never stops that runtime. Other chats/adapters can keep observing it. Each mounted chat owns its own composer draft; unmounting discards that draft. Use `hidden` to retain a chat's draft when collapsing it. Changing the runtime, client identity or session ID resets the chat's transcript and draft atomically.

### Scrolling and upstream props

The default chat follows incoming content only while the reader is at the bottom. Scrolling up pauses following across message/tool steps and new run-start notifications. The down-arrow button or manually returning to the bottom resumes following. Initial history loading and session changes still position the chat at the bottom.

Use typed upstream options to customize these defaults:

```tsx
<CaltraChat client={client} sessionId={sessionId}
  slotProps={{
    viewport: { scrollToBottomOnRunStart: false, scrollToBottomOnInitialize: true },
    composerInput: { autoFocus: false, submitMode: "ctrlEnter" },
  }} />
```

`slotProps.viewport` derives from `ThreadPrimitive.Viewport`; `composerInput` derives from `ComposerPrimitive.Input`. Explicit values override Caltra's defaults. Configure viewport anchoring/event behavior at mount: assistant-ui 0.15.16 retains the initial event callback/options in the verified integration. Remount the chat (or your custom viewport) to change those options; remounting a chat clears its composer draft. Theme/labels/hidden remain live presentation updates. Classes are appended to the SDK classes and styles are forwarded. These inputs exclude structural children/asChild and the deprecated composer submitOnEnter option (use submitMode), and viewport visibility remains controlled by history loading. Existing `components` slots replace presentation inside the same assistant-ui provider; custom slots can use upstream `useAui`/`useAuiState` directly. A custom Composer receives `inputProps` and chooses how to apply them. Caltra's own history and session lifecycle cannot be replaced through presentation props.

For a fully custom assistant-ui tree, use `useAssistantUiRuntime(sessionRuntime)` from `@caltra/assistant-ui` with upstream `AssistantRuntimeProvider`. See the [adapter guide](../assistant-ui/README.md). The original `useCaltraRuntime({ client, sessionId })` hook remains compatible and creates/manages its session runtime automatically. `CaltraSessionStore` remains a deprecated alias; new consumers import `CaltraSessionRuntime` from `@caltra/client`.

The default viewport preserves the reading position when a new turn starts. Consumers can override upstream viewport options explicitly.

Browser deployment prerequisite: activate the Caltra API/worker capability release before upgrading consumers. Client 0.10.0 sends `x-caltra-session-run-state`, which must be allowed by the API’s CORS policy. The runtime’s missing-field fallback applies only after transport succeeds.

## Thinking display

Version 0.13.0 adds a `reasoningDisplay` presentation prop:

```tsx
<CaltraChat client={client} sessionId={sessionId} reasoningDisplay="auto" />
```

- `hidden` (default): no disclosure and no reasoning-text requests.
- `auto`: opens while thinking streams, then collapses at the end of thinking. Users can reopen it.
- `collapsed`: stays closed until expanded manually.
- `expanded`: remains open.

Changing display mode preserves the chat session and composer draft. Display is independent
of model reasoning settings and model context. Only provider-returned displayable text is
available; encrypted state and signatures remain internal.

The main runtime has no reasoning options. Messages contain only availability/status metadata.
Expanding checks the transcript's thinking status. Completed thinking fetches a snapshot without
opening a stream, and a cached final snapshot needs no request. Streaming thinking opens its
separate message-scoped stream before fetching a snapshot; sequence watermarks avoid duplicating
overlapping text. Collapsing disconnects and retains cached text. Reopening unfinished thinking
catches up without showing a loading spinner over cached text. Failure is local to the disclosure
with a retry action. While open, the resource follows transcript status changes, including thinking
that resumes before the message finishes.

Custom consumers can use `useCaltraReasoning(sessionRuntime, messageId, open)` from
`@caltra/assistant-ui`. It returns `parts`, `loading`, `streaming`, `error`, and `retry()`.
The assistant-ui adapter exposes availability in `message.metadata.custom.caltraReasoning`.
For framework-neutral use, `sessionRuntime.reasoning(messageId)` creates an inert independent
resource with `start()`, `stop()`, `subscribe()`, and `getSnapshot()`. Stop it on disposal.
Multiple consumers own independent subscriptions. The main runtime stops all active resources
when it stops. `components.Reasoning` customizes the packaged disclosure.

Deploy the matching API before upgrading the SDK: metadata query negotiation and the new
reasoning snapshot/stream endpoints are required. Existing clients keep their text-only payloads.
