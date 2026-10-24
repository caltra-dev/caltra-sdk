# Caltra SDK test app

This app exercises the local `@caltra/client` and `@caltra/react` packages against a Caltra API. It can list and create sessions, send messages, and stream assistant responses.

For UI changes, start at the [UI convention entry point](../../docs/ui/README.md).

## Run the Thread demo

From the SDK repository root, after `npm install`:

```sh
npm run demo                        # local API stub, no key required
npm run demo -- --local-stub         # explicitly ignore any inherited API key
npm run demo -- --caltra-api-key=<key>
```

`CALTRA_API_KEY` in the launch environment also selects real mode. Prefer environment injection for a saved credential; the Caltra repository's `npm run demo` launcher supplies its GitVaulty-managed demo key without copying it here. CLI keys are optional and may remain in shell history. The repository-pinned npm version rejects unknown flags before the script runs; the `--` separator is required.

The launcher builds the local workspace packages and opens `/thread.html`. The same interface offers Standard Thread, CaltraChat, a session selector, and New conversation. Both modes use the normal CaltraClient authorization exchange, REST schemas, and SSE parser.

The stub implements the demo's authorization, agent lookup, session creation/listing, paginated messages, tool details, sending, cancellation and SSE routes. It is an in-memory simulator of this API subset, not a complete Caltra backend. It starts with 60 deterministic messages and tool success/failure examples. Sending produces eight streamed steps. New conversations are empty; state resets when the server restarts.

Real mode defaults to `https://api.caltra.dev`. Its environment key stays in the Vite server. With only a key, the server resolves/creates workspace `sdk-demo` and the hosted assistant for `sdk-test-user`; the key needs `agents:provision` and `client_tokens:create`. `CALTRA_TENANT_USER_EXTERNAL_ID` overrides that user. If `CALTRA_WORKSPACE_ID` is provided, the workspace and user's hosted agent must already exist. `CALTRA_API_URL` or `--caltra-api-url` selects another backend.

Browser requests use a same-origin server proxy. It validates Origin/Referer against the request host, strips browser cookies before forwarding, and maps loopback HTTP origins to HTTPS for Caltra's production origin policy. The launcher binds to loopback. On private Sprites the actual HTTPS preview origin is preserved and `X-Preview-Authorization` is restored upstream. One-time codes and scoped client tokens reach the browser; the environment API key never does. Keep hosted demos behind authentication.

To run the older Signal Room UI, open `/` on the same server. `npm run dev -w @caltra/test-app` remains available for direct Vite development, with the same environment selection.

## Packaged chat preview

The demo imports `CaltraChat` from `@caltra/react/ui`, which loads its CSS automatically. Default styling uses the
SDK's assistant-ui preset. Independent Theme, Color mode (System/Light/Dark), and Language
selectors demonstrate both presets, a custom brand, and Italian labels while preserving
the session, transcript, scroll position, and draft. Selecting a session writes `?session=<id>`
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

## Deterministic runtime and scroll preview

Open `/?demo=runtime` in the test app to bypass backend authorization and use in-memory sample data. This is an explicitly labeled simulation, not hosted-agent execution. Each reload creates the same 60-message history, initially loading the newest 20 messages; no production requests or data stores are used.

Choose Managed CaltraChat, Caller-owned runtime, or Custom assistant-ui. Scroll up, then click Stream steps: eight alternating message/tool steps arrive over eight seconds. Reading position stays fixed by default. Click the down arrow to follow the remaining steps. Enable Force scroll on run start to exercise the explicit upstream override. This deliberately remounts the chat to provide a fresh viewport for each comparison; toggling this demo option resets the composer draft. In Caller-owned runtime mode, hiding the chat unmounts the UI but leaves the runtime connected; showing it again restores shared history (not the unmounted composer's draft).

Run `npm run test:e2e -w @caltra/test-app -- e2e/runtime-scroll.spec.ts` on the Sprite. These browser checks cover default scroll preservation, resuming follow, explicit override, supplied runtime ownership, and custom adapter send/history.

Private Fly sign-in can return to the demo app root without the query string. If that happens, reopen the full `/?demo=runtime` link after signing in to enter the in-memory preview.

Scroll regression assertions track a visible message's viewport-relative position. Earlier Copy controls stay visible while streaming; native anchoring can still change scrollTop while keeping the same text stationary. A fixed scrollTop assertion alone is insufficient during those layout changes.

## Lazy transcript inspection preview

The demo makes `/?demo=runtime` a deterministic paginated fixture: 60 messages,
with a 20-message initial page. Scrolling near the top loads the preceding page through
assistant-ui 0.15.30 and preserves the visible message position. Click Fail next history load
before scrolling up to test the inline error and Retry control. Custom assistant-ui mode
demonstrates the upstream LoadEarlier primitive directly. The latest
messages include collapsed `demo.echo` and `demo.fail` cards; expanding a card simulates a
350 ms detail fetch, then displays the saved arguments/result. Reopening it uses the runtime
cache. Stream steps also exercises a running tool becoming completed while its panel is open.
This is explicitly simulated data; API authorization and SQL plans are validated separately.

## Thinking display preview

The live SDK demo has a Thinking display selector (Hidden, Auto, Collapsed, Expanded).
Click **Stream thinking**, or use the local deterministic model and send `/think Thinking demo complete`, to stream a clearly
labeled simulated reasoning summary through the real worker/API. Auto expands during thinking
and collapses when it ends; expand again or reload to inspect the saved summary. Collapsed
opens no reasoning-text connection until clicked. Hidden opens none. Mode changes retain drafts.
The command button shares the chat's runtime, preserves the composer draft, and disables while
a turn is running. Thinking and tool expansion use the same accessible loading spinner.

## Transcript Copy placement review

The existing `/?demo=runtime` saved messages 58 and 60 contain text followed by
successful/failed tool calls. Copy belongs directly under each message's text,
before the collapsed tool row; expanding the row must not move Copy below it.
Copy and paste into the composer to verify only the message text is copied.
Stream steps to check that earlier controls remain available and tool-only steps
have no Copy button. These deterministic fixtures verify shared SDK presentation,
not a production Piria session or hosted-agent execution.

## Standard Thread comparison

Open `/thread.html` for the upstream assistant-ui Thread (Base UI, pinned to the
React 0.15.30 release source). **Standard Thread** and **CaltraChat** switch layouts
over one deterministic in-memory conversation. The separate HTML entry keeps its
Tailwind theme isolated from the Signal Room's global styling. Neither production
Piria nor the SDK default changes.

Expand **1 tool call**, then the tool row to inspect saved arguments/results. Copy
remains in upstream's message footer after content/tool groups. Use **Stream steps**
or send any sample text to exercise send/stop; **Load earlier messages** loads the
previous page. Reload resets all sample data. Switching layouts preserves messages
but remounts the composer, so its unsent draft is layout-local.

This is deliberately the standard presentation with the Caltra runtime adapter.
Full tool parts are supplied for this demo; Caltra's lazy-details and reasoning
wrappers are not installed. The stock tool UI can show a completed marker for a
failed tool result, which CaltraChat corrects using durable tool metadata. Attachments,
editing, regeneration and feedback are not implemented by this text-only demo
runtime; visible stock controls are not evidence of backend support. Production
adoption needs that capability and lifecycle integration review.
