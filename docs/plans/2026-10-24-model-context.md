# ModelContext integration implementation plan

**Goal:** Use assistant-ui ModelContext for next-message model/reasoning selection, with its upstream selector in Signal Room.

**Architecture:** The adapter reads the merged thread ModelContext at send time, maps only config.modelName (Caltra platform model UUID) and config.reasoningEffort into a per-send Caltra modelSelection, and retains the independent getContext application-data callback. Explicit per-send selection overrides the runtime default without mutating it. Caltra remains authoritative for allowed combinations. No provider URL/key, system instructions, tools or call settings are forwarded by this feature.

**Tech stack:** Existing React, assistant-ui external-store runtime, Caltra client, upstream Base UI selector; Sprite validation.

1. Extend packages/client/src/session_runtime.ts send options with a per-send modelSelection and test snapshot/fallback behavior in packages/client/tests/session_runtime.test.ts.
2. Add the ModelContext mapping at packages/assistant-ui/src/model_context.ts and use it in src/index.tsx. Test native registration, precedence, cleanup, provider default, changing selections, application context coexistence, and unsupported config fields in tests/runtime.test.tsx and model_context.test.ts.
3. Vendor the upstream ModelSelector and required utilities/components at the same pinned commit as Thread. Replace demo selects with the upstream selector, share its ModelContext between both views, retain loading/error/disabled states, and source choices only from the API. Map nullable effort to the explicit provider-default option. Use the actual session default model/effort for initial selection; fetch failure leaves default messaging available.
4. Document the supported fields and mapping in the adapter/client/demo README files. Keep the existing managed Thread. Server allowlist management is a separate session.
5. Run focused tests, package builds and demo typecheck on the branch Sprite; validate model/effort changes and a next-message send in both views, keyboard interaction and narrow viewport through the browser extension. Commit verified changes, deploy the exact preview commit and request user validation before merge.

No backend migration, production change, or SDK publication is needed. Rollback is the feature commit; request validation continues to belong to Caltra.
