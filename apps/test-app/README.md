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

The demo imports `CaltraChat` and `@caltra/react/styles.css` directly. Default styling uses the
SDK's neutral theme. The Appearance selector demonstrates an Italian translation and theme
variables while preserving the session and draft. Selecting a session writes `?session=<id>`
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
It does not configure a live model route: saved-history and UI validation are available, but
successful AI generation requires a configured model. Never present seeded messages as a
successful live model response.
