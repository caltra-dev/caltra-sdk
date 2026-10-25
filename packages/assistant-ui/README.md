# @caltra/assistant-ui

The React adapter for a framework-neutral `CaltraSessionRuntime`. Imports no CSS and owns no transport lifecycle. Install `@caltra/client`, `@caltra/assistant-ui`, React, React DOM, and the supported `@assistant-ui/react` peer dependency.

```tsx
import { useEffect, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAssistantUiRuntime } from "@caltra/assistant-ui";
import type { CaltraClient } from "@caltra/client";

function Chat({ client, sessionId }: { client: CaltraClient; sessionId: string }) {
  const [session] = useState(() => client.createSessionRuntime({ sessionId }));
  useEffect(() => {
    void session.start().catch(() => undefined); // Observe session.getSnapshot().error for UI feedback.
    return () => { void session.stop(); };
  }, [session]);
  const runtime = useAssistantUiRuntime(session);
  return <AssistantRuntimeProvider runtime={runtime}>
    {/* Compose your own ThreadPrimitive, MessagePrimitive and ComposerPrimitive UI. */}
  </AssistantRuntimeProvider>;
}
// Remount Chat when client identity or sessionId changes, e.g. a keyed boundary.
```

The caller starts and stops the Caltra runtime. Multiple adapters or chats may observe that same runtime without opening extra event streams; removing an adapter does not stop it. Each adapter owns its assistant-ui presentation state (including its composer draft), while messages and connection state come from the shared Caltra runtime. Treat a runtime identity change as a component remount boundary to discard previous assistant-ui message/composer state immediately.

Use upstream `useAui`, `useAuiState` and primitives directly inside `AssistantRuntimeProvider`. The adapter maps messages, tools, loading, send and cancellation. It does not enable unsupported server features: attachments, editing/regeneration, tool answers and branch persistence require corresponding Caltra backend support.

The adapter forwards the session runtime's authoritative turn state. `isRunning` remains true between messages and tools until the persisted turn completes, fails, or is cancelled. Servers without `is_running` retain legacy message-activity behavior. Turn completion does not prove a larger application workflow finished. For custom threads, use `scrollToBottomOnRunStart={false}` to preserve reading position when a new turn begins; CaltraChat applies this default automatically.

## Response projection

Consecutive assistant steps form one UI response bounded by user messages, including
empty, thinking, tool and answer steps. Its first source ID stays stable as new steps
arrive, preserving native Thread's user/assistant top-anchor pair. Text and tools
remain ordered content parts; native `MessagePrimitive.GroupedParts` groups adjacent
tools and keeps groups separated by text. The final response stays running while the
session turn is running, including gaps between completed steps. Failed/cancelled
terminal steps retain their interruption status.

This is a presentation projection, not a rewrite of the canonical transcript or a
new backend turn identifier. Each tool retains `caltraMessageId` for loading details.
Earlier history can extend the first response at a page boundary and select an
earlier source ID; subsequent responses retain their IDs.

## Earlier history

Requires `@assistant-ui/react` 0.15.30 or later in the supported 0.15 range. The adapter maps
Caltra's cursor availability and `loadOlder()` into `hasEarlier` and `onLoadEarlier`.
Custom interfaces can use `thread.hasEarlier`, `thread.isLoadingEarlier`,
`runtime.thread.loadEarlier()` or `ThreadPrimitive.LoadEarlier`. The upstream viewport
preserves visible message positions when older pages arrive. Caltra still owns cursor
merging, request deduplication, and `session.getSnapshot().olderError`; render that error
with a retry control. CaltraChat additionally triggers loading when the reader scrolls near the top.

## Optional thinking text

The adapter carries availability/status in `message.metadata.custom.caltraReasoning`.
For the current UI message, `useCaltraReasoningMessages()` returns every source
`{ messageId, status }`, including reasoning attached to all coalesced response steps.
Render one disclosure per entry and pass that source ID to `useCaltraReasoning`;
the UI message ID alone does not identify all reasoning resources in a group.
Use `useCaltraReasoning(sessionRuntime, messageId, open)` inside your disclosure to load its
separate text resource only while open. Completed thinking fetches without a stream; a cached
final snapshot is reused without a request. Live thinking connects before fetching its snapshot.
The hook returns `parts`, `loading`, `streaming`,
`error`, and `retry()`. Render each part's `text` and use `position` as its stable key.
Closing or unmounting stops this subscription and leaves the main session connected.

## ModelContext model and reasoning selection

The adapter reads the merged `runtime.thread.getModelContext()` for each new message. Standard assistant-ui `ModelSelector` and `aui.modelContext.register()` therefore work without selection callbacks that call the Caltra runtime.

- Set `config.modelName` to the **platform model UUID** returned by `client.getSessionModelChoices(sessionId)`, not a provider model name.
- Set `config.reasoningEffort` to an allowed reasoning level. `provider-default` (or an omitted effort with a selected model) maps to Caltra's `null` reasoning level. Include this choice only when the catalog permits it. An effort-only registration requires another provider to supply the model UUID.
- ModelContext selection overrides `session.setModelSelection()` for that send only. With neither selection field registered, the runtime default still applies; unregistering restores that behavior. Both selection and application `getContext()` data are captured before transport waits. Changes affect subsequent sends, never accepted turns.
- Caltra validates the combination against the session's permitted choices. ModelContext does not grant access or update agent policy.

```tsx
useEffect(() => aui.modelContext.register({
  getModelContext: () => ({ config: {
    modelName: selectedChoice.platform_model_id,
    reasoningEffort: selectedChoice.reasoning_level ?? "provider-default",
  } }),
}), [aui, selectedChoice]);
```

Only model and reasoning selection are supported from ModelContext. The adapter does not forward `system`, `tools`, `callSettings`, `config.apiKey`, or `config.baseUrl` to Caltra. Hosted agent instructions, tools, provider credentials, and endpoints stay server-managed. Application/page data continues to use the separate `getContext` option.
