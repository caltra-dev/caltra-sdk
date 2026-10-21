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

## Optional thinking text

The adapter carries availability/status in `message.metadata.custom.caltraReasoning`.
Use `useCaltraReasoning(sessionRuntime, messageId, open)` inside your disclosure to load its
separate stream and snapshot only while open. The hook returns `parts`, `loading`, `streaming`,
`error`, and `retry()`. Render each part's `text` and use `position` as its stable key.
Closing or unmounting stops this subscription and leaves the main session connected.
