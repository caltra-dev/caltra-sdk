# Customer authentication handoff plan

## Goal

Let browser applications use Caltra sessions after the customer's own backend authenticates the user, without exposing a Caltra server API key or coupling the SDK to Clerk, Better Auth, or another provider.

## Contract

- Customer code supplies an async callback that returns a fresh, single-use Caltra handoff code.
- `@caltra/client` exchanges that code at the Caltra Client API, holds the returned short-lived client token only in memory, and refreshes after the server-provided `refresh_after` time.
- Concurrent calls share one in-flight refresh. `invalidate()` clears cached credentials after an authorization failure or identity change.
- Provider-specific session handling stays in customer code. The SDK never receives the customer provider's secret, session cookie, or server API key.

## Implementation

1. Add a typed `CaltraHandoffTokenProvider` class and options/response types in `packages/client`.
2. Export it from the package root and document direct use with `CaltraClient`.
3. Change the local integration application's server proxy to call Caltra's handoff-creation endpoint and return only the one-time code.
4. Replace the integration app's custom token cache with the package provider.
5. Update root/client/react documentation with both integration choices:
   - Clerk configured directly in Caltra: no customer backend adapter for identity.
   - Generic customer backend: one authenticated same-origin handoff route.
6. Add unit tests for exchange shape, memory caching, refresh timing, concurrent deduplication, invalidation, and safe failures.

## Validation

- `npm run typecheck`
- `npm test`
- `npm run build`
- Inspect generated package declarations and integration-app browser behavior.

