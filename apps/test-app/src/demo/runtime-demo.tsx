import { useEffect, useState } from "react";
import { AssistantRuntimeProvider, ThreadPrimitive, MessagePrimitive, ComposerPrimitive } from "@assistant-ui/react";
import { useAssistantUiRuntime } from "@caltra/assistant-ui";
import type { CaltraSessionRuntime } from "@caltra/client";
import { CaltraChat } from "@caltra/react/ui";
import { DemoClient, demoSessionId } from "./client.js";

export function RuntimeDemo() {
  const [client] = useState(() => new DemoClient());
  const [runtime] = useState(() => client.createSessionRuntime({ sessionId: demoSessionId }));
  const [mode, setMode] = useState("managed");
  const [mounted, setMounted] = useState(true);
  const [forceScroll, setForceScroll] = useState(false);
  useEffect(() => {
    if (mode === "managed") return;
    void runtime.start().catch(() => undefined);
    return () => { void runtime.stop(); };
  }, [mode, runtime]);
  useEffect(() => () => client.disposeTimers(), [client]);
  return <main style={{ maxWidth: 960, margin: "0 auto", padding: 20 }}>
    <h1>Caltra runtime demo</h1>
    <p>Sample history and simulated message/tool events. No backend or production data.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "16px 0" }}>
      <label>Integration <select aria-label="Integration" value={mode} onChange={event => { client.disposeTimers(); setMode(event.target.value); }}>
        <option value="managed">Managed CaltraChat</option>
        <option value="shared">Caller-owned runtime</option>
        <option value="custom">Custom assistant-ui</option>
      </select></label>
      <button onClick={() => client.streamSteps()}>Stream steps</button>
      <button onClick={() => setMounted(value => !value)}>{mounted ? "Hide chat" : "Show chat"}</button>
      <label><input type="checkbox" checked={forceScroll} onChange={event => setForceScroll(event.target.checked)} /> Force scroll on run start (resets chat)</label>
    </div>
    <p>Scroll up, then stream steps. Use the down arrow to resume following. In caller-owned mode, hide/show preserves the runtime.</p>
    <div style={{ height: "65dvh", minHeight: 300, border: "1px solid #d4d4d8", borderRadius: 12, overflow: "hidden" }}>
      {mounted && (mode === "custom" ? <CustomChat runtime={runtime} /> : mode === "shared"
        ? <CaltraChat key={String(forceScroll)} runtime={runtime} slotProps={{ viewport: { scrollToBottomOnRunStart: forceScroll ? true : undefined }, composerInput: { autoFocus: false } }} />
        : <CaltraChat key={String(forceScroll)} client={client} sessionId={demoSessionId} slotProps={{ viewport: { scrollToBottomOnRunStart: forceScroll ? true : undefined }, composerInput: { autoFocus: false } }} />)}
    </div>
  </main>;
}

function CustomChat({ runtime }: { runtime: CaltraSessionRuntime }) {
  const assistantRuntime = useAssistantUiRuntime(runtime);
  return <AssistantRuntimeProvider runtime={assistantRuntime}>
    <ThreadPrimitive.Root style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <ThreadPrimitive.Viewport style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: 16 }} scrollToBottomOnRunStart={false}>
        <ThreadPrimitive.Messages>{({ message }) => <MessagePrimitive.Root style={{ padding: 12 }}>
          <strong>{message.role === "user" ? "You" : "Assistant"}</strong><MessagePrimitive.Parts />
        </MessagePrimitive.Root>}</ThreadPrimitive.Messages>
        <ThreadPrimitive.ScrollToBottom>Latest message</ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root style={{ padding: 12 }}>
        <ComposerPrimitive.Input aria-label="Custom message" placeholder="Write a message…" />
        <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
