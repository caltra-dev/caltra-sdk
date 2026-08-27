import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import type { CaltraClient, CaltraSession } from "@caltra/client";
import { useCaltraRuntime } from "@caltra/react";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";

interface ChatProps {
  client: CaltraClient;
  session: CaltraSession;
}

export function Chat({ client, session }: ChatProps) {
  const caltra = useCaltraRuntime({ client, sessionId: session.id });

  return (
    <AssistantRuntimeProvider runtime={caltra.runtime}>
      <main className="chat-shell">
        <header className="chat-header">
          <div>
            <span className="eyebrow">ACTIVE AGENT CHANNEL</span>
            <h1>{session.agent.name}</h1>
          </div>
          <div className={`connection ${caltra.connection}`}>
            <span />
            {caltra.connection}
          </div>
        </header>

        <ThreadPrimitive.Root className="thread-root">
          <ThreadPrimitive.Viewport className="thread-viewport">
            <AuiIf condition={(state) => state.thread.isEmpty}>
              <div className="thread-empty">
                <span>LINE OPEN</span>
                <h2>Send the first signal.</h2>
                <p>The stream is authenticated and the durable transcript is synchronized.</p>
              </div>
            </AuiIf>

            <ThreadPrimitive.Messages>
              {({ message }) => (
                <MessagePrimitive.Root className={`message ${message.role}`}>
                  <span className="message-role">
                    {message.role === "user" ? "YOU" : session.agent.name.toUpperCase()}
                  </span>
                  <div className="message-body"><MessagePrimitive.Parts /></div>
                </MessagePrimitive.Root>
              )}
            </ThreadPrimitive.Messages>

            <ThreadPrimitive.ViewportFooter className="thread-footer">
              <ThreadPrimitive.ScrollToBottom className="scroll-button" aria-label="Scroll to bottom">
                <ArrowDown size={16} />
              </ThreadPrimitive.ScrollToBottom>
              {caltra.error && (
                <button className="error-banner" type="button" onClick={() => void caltra.refresh()}>
                  <RefreshCw size={14} /> {caltra.error.message}
                </button>
              )}
              <ComposerPrimitive.Root className="composer">
                <ComposerPrimitive.Input placeholder="Transmit a message…" rows={1} />
                <ComposerPrimitive.Send aria-label="Send message">
                  <ArrowUp size={19} strokeWidth={2.5} />
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
              <p className="composer-note">ENTER TO SEND · DURABLE SESSION · LIVE SSE</p>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </main>
    </AssistantRuntimeProvider>
  );
}
