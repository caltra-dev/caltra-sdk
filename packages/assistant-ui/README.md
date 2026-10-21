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

The current public event protocol exposes message starts/completions and tool starts, not authoritative whole-turn completion. `isRunning` reflects streaming/message activity and can toggle between steps. Do not use it as proof that a server automation finished. For custom threads, use `scrollToBottomOnRunStart={false}` to preserve reading position across these transitions. CaltraChat applies this default automatically.
