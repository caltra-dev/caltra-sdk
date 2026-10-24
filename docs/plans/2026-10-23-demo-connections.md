# Demo connections

Use `npm run demo` as the SDK entry point. Default to a local HTTP API simulator; an explicit key selects the real Caltra API. `--local-stub` overrides inherited credentials. Both modes render the standard assistant-ui Thread and CaltraChat against the same real CaltraClient transport. Simulated sessions are process-local and deterministic; live sessions persist in the selected key's environment.

The local Vite server owns the environment key and exchanges it for browser-bound one-time authorizations. If no workspace ID is supplied, resolve/create `sdk-demo` and its demo user's hosted assistant through the server SDK. Store the operator's production demo key only in Caltra's GitVaulty ciphertext, and inject it into the launch environment. Sprite service configuration is a runtime delivery copy.

Validate option precedence, secret filtering, auth exchange and real SDK requests against the HTTP stub, server errors, both UI modes, and a real persisted production demo conversation. Hold branch merge until user preview acceptance.

Production rejects HTTP origins. The demo uses a same-origin BFF for client API routes, validates incoming browser origin against Host, strips cookies, and maps only loopback HTTP origins to HTTPS upstream. Public HTTP origins are not promoted. The CLI binds loopback; branch Sprite remains private. Production model response was verified in the dedicated demo environment.
