import { useEffect, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAssistantUiRuntime } from "@caltra/assistant-ui";
import { CaltraChat } from "@caltra/react/ui";
import { Thread } from "../upstream/components/assistant-ui/elements/thread.aui.js";
import { Button } from "../upstream/components/ui/button.js";
import { DemoClient, demoSessionId } from "./client.js";

/** Standard Thread consumes full tool parts; no Caltra lazy-tool presentation is installed. */
class ThreadDemoClient extends DemoClient {
  override async listSessionMessages(...args: Parameters<DemoClient["listSessionMessages"]>) {
    const page = await super.listSessionMessages(...args);
    return { ...page, data: page.data.map(message => {
      const saved = this.messages.find(item => item.id === message.id);
      return { ...message, ...(saved?.tool_calls ? { tool_calls: structuredClone(saved.tool_calls) } : {}) };
    }) };
  }
}

export function StandardThreadDemo() {
  const [client] = useState(() => new ThreadDemoClient());
  const [runtime] = useState(() => client.createSessionRuntime({ sessionId: demoSessionId }));
  const [view, setView] = useState("standard");
  const assistantRuntime = useAssistantUiRuntime(runtime);
  useEffect(() => {
    void runtime.start().catch(() => undefined);
    return () => { client.disposeTimers(); void runtime.stop(); };
  }, [client, runtime]);

  return <main className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
      <div>
        <h1 className="text-sm font-semibold">Thread comparison</h1>
        <p className="mt-1 text-xs text-muted-foreground">Simulated conversation · no production data or backend calls</p>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Demo controls">
        <Button variant={view === "standard" ? "default" : "outline"} size="sm" aria-pressed={view === "standard"}
          onClick={() => setView("standard")}>Standard Thread</Button>
        <Button variant={view === "caltra" ? "default" : "outline"} size="sm" aria-pressed={view === "caltra"}
          onClick={() => setView("caltra")}>CaltraChat</Button>
        <Button variant="outline" size="sm" onClick={() => client.streamSteps()}>Stream steps</Button>
      </div>
    </header>
    <div className="min-h-0 flex-1">
      {view === "standard"
        ? <AssistantRuntimeProvider runtime={assistantRuntime}><Thread autoFocus={false} /></AssistantRuntimeProvider>
        : <CaltraChat runtime={runtime} colorMode="light" slotProps={{ composerInput: { autoFocus: false } }} />}
    </div>
  </main>;
}
