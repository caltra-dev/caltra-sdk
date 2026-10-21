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
port 4001 and browser API calls through the same-origin gateway. The existing dogfood seed
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

Open `/?demo=runtime` in the test app to bypass backend authorization and use in-memory sample data. This is an explicitly labeled simulation, not hosted-agent execution. Each reload creates the same 36-message history; no production requests or data stores are used.

Choose Managed CaltraChat, Caller-owned runtime, or Custom assistant-ui. Scroll up, then click Stream steps: eight alternating message/tool steps arrive over eight seconds. Reading position stays fixed by default. Click the down arrow to follow the remaining steps. Enable Force scroll on run start to exercise the explicit upstream override. This deliberately remounts the chat because assistant-ui 0.15.16 retains the initial viewport event callback; toggling this demo option resets the composer draft. In Caller-owned runtime mode, hiding the chat unmounts the UI but leaves the runtime connected; showing it again restores shared history (not the unmounted composer's draft).

Run `npm run test:e2e -w @caltra/test-app -- e2e/runtime-scroll.spec.ts` on the Sprite. These browser checks cover default scroll preservation, resuming follow, explicit override, supplied runtime ownership, and custom adapter send/history.

Private Fly sign-in can return to the demo app root without the query string. If that happens, reopen the full `/?demo=runtime` link after signing in to enter the in-memory preview.

Scroll regression assertions track a visible message's viewport-relative position. The upstream Copy action bars hide while streaming and reappear between steps, so native scroll anchoring can correctly change scrollTop while keeping the same text stationary. A fixed scrollTop assertion alone is insufficient during those layout changes.

## Lazy transcript inspection preview

The pending release makes `/?demo=runtime` a deterministic paginated fixture: 36 messages,
with a 20-message initial page and Load older messages for the preceding page. The latest
messages include collapsed `demo.echo` and `demo.fail` cards; expanding a card simulates a
350 ms detail fetch, then displays the saved arguments/result. Reopening it uses the runtime
cache. Stream steps also exercises a running tool becoming completed while its panel is open.
This is explicitly simulated data; API authorization and SQL plans are validated separately.
