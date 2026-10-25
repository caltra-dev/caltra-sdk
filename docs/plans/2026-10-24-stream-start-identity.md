# Initial response identity and streaming investigation

Scope: follow up the accepted stable-response grouping with the residual flicker
at the beginning of thinking or tools, and trace perceived slow text streaming.
Keep native assistant-ui Thread presentation, animations and scrolling unchanged.

## Evidence and implementation

Two new regression tests failed before the fix on the Sprite's assistant-ui 0.15.30:

- Acknowledging a send changed the optimistic user ID and caused assistant-ui to
  generate a second upcoming assistant ID. The first real assistant step changed
  the assistant ID again. Those IDs identify native message roots and top anchors.
- A single answer delta rebuilt the native object for an unchanged user message.
  Projection rebuilt every group, then `ExportedMessageRepository.fromArray`
  converted the full transcript on each delta.

The client retains a local key for each acknowledged user ID without changing
canonical snapshot IDs. The adapter retains the upcoming response's display ID
through the first source step and later thinking/tools/text. Lazy resource metadata
continues to carry canonical source IDs. Group and native conversion caches reuse
unchanged messages; the authoritative repository still removes obsolete messages.

Regression coverage includes the initial anchor pair, later execution steps,
source IDs, cancellation/removal of pending placeholders, and history/branch
reconciliation. Validate client, adapter, React and demo suites, typechecks and
demo build on Sprite; then commit, update the preview and check via Chrome extension.

## Streaming trace

A real API request for about 400 words through the Sprite's existing localhost
preview gateway delivered 2,621 characters in 38 text deltas. First text arrived
2,838 ms after send; text streamed for 8,805 ms. Inter-delta gaps: median 224 ms,
p95 389 ms, maximum 856 ms. Event consumption to SDK snapshot update rounded to
0 ms for every chunk (below 1 ms at this measurement precision). This does not
measure the browser render or the private Sprite edge.

An independent Chrome extension run saw first text by 3.52 s, sampled visible
updates 112–322 ms apart (median 165 ms), and the completion control at 11.91 s.
It caught an initial pending accessibility node disappearing at 1.35 s and
returning at 1.45 s; screenshots did not capture a fully blank frame. The preview
was being rebuilt during this baseline investigation, so those browser timings
are supporting evidence, not an immutable-build comparison.

Inspected backend source batches provider deltas for up to 150 ms or 2,048 bytes
in `AgentEventSink`, awaits transactional stream persistence, then publishes to
Redis. API and SDK forward available events without an intentional text throttle.
The production model, database and Redis contributions were not timed separately;
the 856 ms gap cannot be attributed to any one of them from this trace. No backend
batching or durability change is included in this SDK fix.

A 1,000-delta Sprite microbenchmark measured projection plus native conversion.
With 20 messages, p95 decreased from 0.076 ms to 0.019 ms, retaining 19 unchanged
objects instead of zero. With 200 messages, p95 decreased from 0.347 ms to 0.071 ms,
retaining 199 unchanged objects. This measures allocation/conversion savings, not
browser paint performance, and does not explain the upstream delivery gaps.
