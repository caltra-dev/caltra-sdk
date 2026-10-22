# Caltra SDK test app

This app exercises the local `@caltra/client` and `@caltra/react` packages against a Caltra API. It can list and create sessions, send messages, and stream assistant responses.

For UI changes, start at the [UI convention entry point](../../docs/ui/README.md).

## Configure

Copy the example environment file:

```sh
cp .env.example .env.local
```

Set these values in `.env.local`:

```dotenv
CALTRA_API_URL=https://api.caltra.dev
CALTRA_API_KEY=csk_replace_me
CALTRA_WORKSPACE_ID=00000000-0000-4000-8000-000000000000
CALTRA_TENANT_USER_EXTERNAL_ID=sdk-test-user
```

`CALTRA_API_KEY` is read only by the local Vite server. The server creates a one-time Caltra
client authorization and returns only its one-time code to `CaltraClient`; neither the API key nor the
tenant-scoped browser token is exposed by the application's backend route.

Provision a hosted agent for `CALTRA_TENANT_USER_EXTERNAL_ID` through the server SDK before opening the app. Sessions are created within that agent.

## Run

From this directory:

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Changes to the local SDK packages are picked up through the repository's npm workspaces.

To override individual `.env.local` values for one run, pass npm options:

```sh
npm run dev --api-key=csk_replace_me --caltra-url=https://api.caltra.dev
```

The supported options are `--api-key`, `--caltra-url`, `--workspace-id`, and `--tenant-user-external-id`. Each supplied option takes precedence over its matching `.env.local` value; omitted options continue to use `.env.local` or the documented default.

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
