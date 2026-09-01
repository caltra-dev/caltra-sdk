# Caltra SDK test app

This app exercises the local `@caltra/client` and `@caltra/react` packages against a Caltra API. It can list and create sessions, send messages, and stream assistant responses.

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
handoff and returns only that handoff to `CaltraHandoffTokenProvider`; neither the API key nor the
tenant-scoped browser token is exposed by the application's backend route.

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
