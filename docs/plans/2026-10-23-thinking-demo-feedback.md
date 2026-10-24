# Thinking demo feedback

Goal: distinguish pending answers from actual reasoning without replacing upstream Thread.

Evidence: the real demo returned ordinary replies to `/think` with no reasoning disclosure. The HTTP stub produced a disclosure that opened during streaming, collapsed on completion and reopened in Expanded mode. The pending indicator uses an intentional pulse animation.

Plan: keep verified Auto behavior; replace the pulsing pending dot with steady localized Working text; enable the deterministic test only in stub mode, with an explanation in real mode. Typecheck and run demo tests on the Sprite, verify both launch modes with the browser extension, commit, and retain preview for user acceptance.

Validation: Sprite typecheck, production build, and all 12 demo tests passed. Browser-extension checks confirmed steady Working text, Auto opening while streaming, collapse after completion, and manual reopening with the complete summary. This establishes reasoning behavior in the stub only; the real session produced no reasoning disclosure.
