# Standard Thread comparison demo

Goal: let the reviewer try assistant-ui's maintained Thread directly, alongside CaltraChat, without changing Piria or the SDK's default presentation.

1. Vendor the Base UI Thread and its required source dependencies from assistant-ui commit `79e5919d8c9c72bd4697c672f0f228c2a62edec4` (React 0.15.30). Preserve markup and behavior; record source provenance/license.
2. Add Tailwind to the test app and an isolated standard-Thread entry with the upstream theme. Connect it to the existing Caltra assistant-ui runtime and deterministic sample client. Expose a deep link and comparison navigation. Keep real backend authorization out of this in-memory demo.
3. Run dependency installation, test-app typecheck/build and relevant tests on the existing branch Sprite. Verify exact tracked-file parity and browser-check tool grouping, copy, send/stop, history loading and narrow-screen layout.
4. Commit and deploy the checked revision. Open the demo and hand off its URL for user review; keep merge, SDK replacement/release and Piria rollout pending.

The upstream action bar stays after message content/tool groups. This trial intentionally demonstrates that default rather than porting the earlier Copy placement change into it. Unsupported runtime capabilities remain governed by assistant-ui's capability checks.
