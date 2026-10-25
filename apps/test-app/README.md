# Caltra SDK test app

This app exercises the local `@caltra/client` and `@caltra/react` packages against a Caltra API. It can list and create sessions, send messages, and stream assistant responses.

For UI changes, start at the [UI convention entry point](../../docs/ui/README.md).

## Run Signal Room

From the SDK repository root, after `npm install`:

```sh
npm run demo                        # local API stub, no key required
npm run demo -- --local-stub         # explicitly ignore any inherited API key
npm run demo -- --caltra-api-key=<key>
```

`CALTRA_API_KEY` in the launch environment also enables and initially selects **Real Caltra API**. Signal Room’s **Connection** setting always offers **Local stub**, and automatically adds **Real Caltra API** when a key is supplied. Without a key (or with the explicit `--local-stub` isolation override), only Local stub is available. Switching connection remounts the client and session, clears drafts and the session deep link, and closes the previous event subscription. It does not cancel a server-side run. The selector stays usable during loading or authentication errors. Prefer environment injection for a saved credential; the Caltra repository's `npm run demo` launcher supplies its GitVaulty-managed demo key without copying it here. CLI keys are optional and may remain in shell history. The repository-pinned npm version rejects unknown flags before the script runs; the `--` separator is required.

The launcher builds the local workspace packages and opens Signal Room at `/`. Its Chat view selector offers CaltraChat and Standard Thread over the same selected session and runtime. Both modes use the normal CaltraClient authorization exchange, REST schemas, and SSE parser.

The stub implements the demo's authorization, agent lookup, session creation/listing, paginated messages, tool details, sending, cancellation and SSE routes. It is an in-memory simulator of this API subset, not a complete Caltra backend. It starts with 60 deterministic messages and tool success/failure examples. Sending produces eight streamed steps; `/think` produces a simulated reasoning summary on the separate reasoning endpoint and SSE stream. New conversations are empty; state resets when the server restarts.

Real mode defaults to `https://api.caltra.dev`. Its environment key stays in the Vite server. With only a key, the server resolves/creates workspace `sdk-demo` and the hosted assistant for `sdk-test-user`; the key needs `agents:provision` and `client_tokens:create`. `CALTRA_TENANT_USER_EXTERNAL_ID` overrides that user. If `CALTRA_WORKSPACE_ID` is provided, the workspace and user's hosted agent must already exist. `CALTRA_API_URL` or `--caltra-api-url` selects another backend.

Stub browser requests are isolated under `/demo/stub`; real browser requests use the existing origin-root routes and a same-origin server proxy. It validates Origin/Referer against the request host, strips browser cookies before forwarding, and maps loopback HTTP origins to HTTPS for Caltra's production origin policy. The launcher binds to loopback. On private Sprites the actual HTTPS preview origin is preserved and `X-Preview-Authorization` is restored upstream. One-time codes and scoped client tokens reach the browser; the environment API key never does. Keep hosted demos behind authentication.

`npm run dev -w @caltra/test-app` remains available for direct Vite development, with the same environment selection.

## Packaged chat preview

The demo imports `CaltraChat` from `@caltra/react/ui`, which loads its CSS automatically. Default styling uses the
SDK's assistant-ui preset. Independent Theme, Color mode (System/Light/Dark), and Language
selectors demonstrate both presets, a custom brand, and Italian labels while preserving
the session, transcript, scroll position, and draft within CaltraChat. Switching chat views remounts the composer, so an unsent draft is view-local. Selecting a session writes `?session=<id>`
so reloading that URL exercises loading the saved transcript directly; IDs are resolved only
within the authorized session list.

Private Sprite gateways must restore `X-Preview-Authorization` to `Authorization` and forward
the exact browser Origin (including for GET requests without an Origin header). The demo's
fetch adapter uses that header only for its same-origin `.sprites.app` gateway. Production API
requests retain the standard Authorization header. Keep the Sprite private.

For the combined Caltra/SDK branch preview, run this demo beside the isolated Caltra API with
its seeded local `dogfood_assistant.server_api_key`, workspace
`40000000-0000-4000-8000-000000000001` and tenant external ID
`10000000-0000-4000-8000-000000000001`. Route the demo's server authorization call to local
port 4001 with `CALTRA_API_URL=http://127.0.0.1:4001` and set `CALTRA_BROWSER_API_URL`
to the private Sprite URL for browser API calls through the same-origin gateway. Route
`/api/client-authorization` to this demo's Vite server. The existing dogfood seed
provides saved session `90000000-0000-4000-8000-000000000001` and empty conversations.
The Caltra development stack now seeds a `Local deterministic model` and starts its loopback
provider. Try `/help`, `/echo Hello`, `/capabilities records`, `/tool <capability-id>`, and
`/call <versioned-action-id> {"recordId":"demo"}`. This exercises real hosted execution,
authorization, streaming, and history without LLM tokens. Tool calls are real; the default
records backend contains isolated development data and grants `records.read`, `demo.echo`, and `demo.fail`. This is
a deterministic test provider, not evidence of live AI generation.

Use `/capabilities` or `/capabilities ""` to list the authorized demo tools. Load a returned
capability with `/tool <capability-id>`, then copy its current versioned action ID into
`/call <action-id> {"text":"Hello"}` for `demo.echo` or `/call <action-id> {}` for `demo.fail`.
Echo waits 1.5 seconds to make progress visible; failure intentionally returns an error.
The seed is idempotent, grants demo tools to the development workspace audience, and keeps
`records.update` ungranted. Do not hard-code action IDs: manifest publication versions them.

## Local API stub scenarios

Send `/tools` in Local stub mode to stream three consecutive tool-only steps and
a final answer. Standard Thread should show one native **3 tool calls** group;
expand it to see all three calls. Reload the session to check history grouping.
This command is a deterministic local fixture, not a production agent command.

The adapter keeps one assistant UI message per user-delimited response throughout
empty, thinking, tool and answer steps. Standard Thread's native top anchor stays
attached to that stable message. A 1rem inset on the demo host sits outside the
scrollport so the pinned user message does not touch the header; the upstream
Thread, reserve-space logic and scroll behavior are unchanged. Native top anchoring
still intentionally leaves room below a new question for its incoming answer.

Launch with `npm run demo -- --local-stub`. Signal Room loads 60 saved messages,
initially displaying the newest 20. Scroll up in CaltraChat, or use **Load earlier
messages** in Standard Thread, to load older pages. Send any text for eight streamed
message/tool steps; use Stop to cancel. Create a session to start empty.

Saved messages 58 and 60 include successful/failed tool calls. In CaltraChat, expand
a tool to fetch details. Copy stays directly below the text, before trailing tools.
Standard Thread retains its upstream action-bar placement below the message.

The old `?demo=runtime` simulation and separate `/thread.html` entry are removed.
The server stub still uses deterministic fixtures, but the browser always uses the
real CaltraClient HTTP/SSE path. The browser regression sources now target Signal
Room. Scroll assertions should compare a visible message's viewport-relative
position, not only scrollTop, because layout changes can trigger native anchoring.

## Controls in both chat views

Both views show Chat view, Thinking display, Theme, Color mode, Language, and
Stream thinking (enabled only in local-stub mode). Settings stay selected when switching views. Theme presets map
to the standard Thread's CSS tokens; System mode follows the OS preference live.
The Thread reset and tokens are scoped to its panel, including tooltip/dialog portals.

Both views support English and Italian. Thread's copied components consume a
small typed locale context; changing language updates labels, placeholders,
tooltips, tool/reasoning controls and accessibility text without remounting Thread
or clearing the composer draft. Common Italian strings reuse the CaltraChat labels.
Upstream Thread, message layout, composer, and runtime remain in use. Locale changes
do not translate existing messages, provider errors, tool names/results or approval
payloads. The Signal Room shell controls remain English, as in CaltraChat.

**Stream thinking** sends `/think Thinking demo complete` through the shared runtime.
It is enabled only with the HTTP stub. `/think` is not a production API command;
the real demo model may answer it as ordinary text without returning reasoning.
Real mode explains this restriction and disables the test button. Display settings
control existing reasoning; they cannot enable reasoning in a model.
The Standard Thread pending indicator uses the upstream pulsing dot,
separate from a Reasoning disclosure. It disappears when an answer arrives.

Both views support Thinking display. A demo adapter composes the stock Thread
message and reasoning disclosure with `useCaltraReasoning`; reasoning text is
fetched only when the disclosure opens. Auto expands during reasoning and collapses afterward; Collapsed
fetches only when opened, Hidden never fetches, and Expanded stays open. Changing
these controls does not remount the composer.

## Standard Thread integration boundary

The upstream Thread uses Base UI and is pinned to assistant-ui React 0.15.30 source;
see [provenance](src/upstream/README.md). Its Reload and Markdown export controls
are omitted. Copy and capability-gated feedback remain. No SDK consumer needs the
demo's Tailwind dependencies.

The standard tool UI does not load Caltra's lazy tool details automatically. It can
show a completed marker for a failed result. CaltraChat handles durable tool status
and lazy loading. Attachments, editing, regeneration and feedback are not supported
by this text-only runtime. Neither production Piria nor the SDK default changes.

## Model and reasoning choices (unreleased)

Signal Room shares a **Model and reasoning** picker across CaltraChat
and Standard Thread. In Standard Thread it sits directly inside the managed composer; in CaltraChat it remains in the header. Choices come from `GET /client/v1/sessions/:id/model-choices`;
the UI never hard-codes production models or supported efforts. A selection
applies to the next message in the current conversation and remains selected
while that runtime is mounted. The picker is disabled during a turn.

The HTTP stub offers Demo Fast and Demo Reasoning (provider default, low, high).
Choose Demo Reasoning and send ordinary text to stream a deterministic reasoning
summary; its effort label confirms the submitted setting. These are simulated
models, not provider inference. Real mode requires the matching Caltra API
release and hosted-agent user choices. Older servers retain session-default
messaging and show a model-catalog error with Retry. This feature does not deploy
or publish either repository automatically.

The Model and reasoning control uses upstream assistant-ui ModelSelector and its native ModelContext registration. Caltra's session model-choices endpoint supplies all choices and effort levels; the local stub supplies deterministic equivalents. Both chat views consume the same context, and changing view preserves the selection. Controls are disabled while a reply is active. ModelContext selection is separate from Thinking display, which only controls disclosure visibility. When an older API does not expose choices, default messaging remains available.

### Preview verification (2026-10-24)

The connection picker and composer ModelSelector were verified on the private
branch Sprite, including a 390px viewport, selection across chat views, and the
stub's high-effort response. All 14 demo tests, demo type checking, and the demo
build passed. The real connection authenticated and loaded its separate saved
sessions. The initial production model-choices 404 was resolved by the backend
release. Subsequent client API verification returned all 40 allowed model/effort
pairs for the demo agent. This API check does not establish visual validation of
the later Thinking dropdown.

When supplying the Caltra-owned demo credential to a preview, load the development
tooling environment first and then explicitly supply the demo configuration.
Node's `--env-file` does not overwrite inherited variables; an unrelated inherited
`CALTRA_API_KEY` can otherwise shadow the encrypted demo credential. Never copy
that credential into the SDK checkout.

The model picker uses the stock assistant-ui appearance, including its default trigger and popup sizing. No selector-specific CSS or descriptive hint is added. Its popup mounts within the owning UI theme scope so light/dark and the selected chat theme remain consistent. Catalog errors still appear when actionable.

Thinking uses a dropdown of the selected model’s permitted efforts, including Provider default. This follows assistant-ui’s documented custom-effort composition because its stock horizontal row clips larger catalogs. The native ModelContext registration still forwards the selected model and effort on the next message.
