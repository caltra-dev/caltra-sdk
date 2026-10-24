# Transcript Copy Placement Implementation Plan

**Goal:** Keep the assistant message Copy control beside its text when tools follow.

**Architecture:** Keep the SDK adapter and transcript ordering unchanged. Render the existing assistant-ui message Copy action after the adapter's single text part inside the shared CaltraMessage text renderer. Retain message-local running visibility and upstream clipboard behavior. Do not attach actions to tool-only or user messages.

**Tech Stack:** React, assistant-ui, Vitest, private Sprite demo.

1. Add a regression in `packages/react/tests/chat.test.tsx` for text → Copy → tools, copied text excluding tool payloads, and tool-only messages without Copy. Run against the original component on the branch Sprite and confirm failure.
2. Move the existing action markup into the text-part renderer in `packages/react/src/ui/chat.tsx`. Keep message state and labels inherited from the runtime/context. Verify existing streaming/stable-control coverage plus the new regression, typecheck and build on the Sprite.
3. Use the existing `/?demo=runtime` deterministic fixtures (saved messages 58 and 60 contain text plus tools). Document the placement contract in `packages/react/README.md` and review steps in `apps/test-app/README.md`.
4. Commit verified code, deploy the exact revision, verify tracked-file parity, and inspect text/Copy/tool order and copy/expand/stream behavior through the browser extension. Leave the branch and private preview available for user acceptance before merge, package release, or Piria dependency update.

Moving tool cards ahead of text would obscure transcript sequence. One footer at the end of the entire turn would detach Copy from intermediate text. The chosen placement changes only the action location.
