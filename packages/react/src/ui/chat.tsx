"use client";

import {
  ActionBarPrimitive, AssistantRuntimeProvider, AuiIf, ComposerPrimitive,
  MessagePrimitive, ThreadPrimitive, useAuiState,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo, useState, type ComponentType, type CSSProperties } from "react";
import { useCaltraRuntime, type UseCaltraRuntimeOptions, type UseCaltraRuntimeResult } from "../use_caltra_runtime.js";
import { defaultCaltraChatLabels, type CaltraChatLabels } from "./labels.js";

export interface CaltraChatSlotProps { labels: CaltraChatLabels; }
export interface CaltraComposerProps extends CaltraChatSlotProps { submitMode: "enter" | "ctrlEnter" | "none"; }
export interface CaltraConnectionProps extends CaltraChatSlotProps {
  connection: UseCaltraRuntimeResult["connection"];
  error: Error | null;
  historyLoaded: boolean;
  retry(): Promise<void>;
}

/** Slots replace presentation while staying inside the same assistant-ui runtime provider. */
export interface CaltraChatComponents {
  Welcome?: ComponentType<CaltraChatSlotProps>;
  Loading?: ComponentType<CaltraChatSlotProps>;
  Message?: ComponentType<CaltraChatSlotProps>;
  Composer?: ComponentType<CaltraComposerProps>;
  Connection?: ComponentType<CaltraConnectionProps>;
}

export interface CaltraChatProps extends UseCaltraRuntimeOptions {
  labels?: Partial<CaltraChatLabels>;
  components?: CaltraChatComponents;
  className?: string;
  style?: CSSProperties & { [key: `--caltra-${string}`]: string | number };
  /** Hide the panel without disposing its session or draft. */
  hidden?: boolean;
  submitMode?: CaltraComposerProps["submitMode"];
}

/** Styled chat with safe loading/empty states. Import @caltra/react/styles.css once in the host. */
export function CaltraChat({ client, sessionId, ...presentation }: CaltraChatProps) {
  // A new client is an authorization boundary. Remount atomically rather than briefly
  // rendering the old assistant-ui repository while a hook effect switches stores.
  const Session = useMemo(() => function Session(props: Omit<CaltraChatProps, "client" | "sessionId">) {
    return <ChatSession {...props} client={client} sessionId={sessionId} />;
  }, [client, sessionId]);
  return <Session {...presentation} />;
}

function ChatSession({ client, sessionId, labels: overrides, components = {}, className, style, hidden, submitMode = "enter" }: CaltraChatProps) {
  const caltra = useCaltraRuntime({ client, sessionId });
  const labels = useMemo(() => ({ ...defaultCaltraChatLabels, ...overrides }), [overrides]);
  const { Welcome = CaltraWelcome, Loading = CaltraHistoryLoading, Message = CaltraMessage,
    Composer = CaltraComposer, Connection = CaltraConnection } = components;

  return <AssistantRuntimeProvider runtime={caltra.runtime}>
    <ThreadPrimitive.Root className={`caltra-chat${className ? ` ${className}` : ""}`} style={style} hidden={hidden} aria-label={labels.chat}>
      <Connection labels={labels} connection={caltra.connection} error={caltra.error} historyLoaded={caltra.historyLoaded} retry={caltra.reconnect} />
      <ThreadPrimitive.Viewport className="caltra-chat__viewport" autoScroll>
        <div className="caltra-chat__content">
          {!caltra.historyLoaded && caltra.connection !== "failed" && <Loading labels={labels} />}
          {caltra.historyLoaded && <>
            <AuiIf condition={(state) => state.thread.messages.length === 0 && !state.thread.isLoading}>
              <Welcome labels={labels} />
            </AuiIf>
            <div className="caltra-chat__messages"><ThreadPrimitive.Messages>{() => <Message labels={labels} />}</ThreadPrimitive.Messages></div>
          </>}
          <ThreadPrimitive.ViewportFooter className="caltra-chat__footer">
            <ThreadPrimitive.ScrollToBottom className="caltra-chat__scroll" aria-label={labels.scrollToBottom}>
              <span aria-hidden="true">↓</span>
            </ThreadPrimitive.ScrollToBottom>
            <Composer labels={labels} submitMode={submitMode} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}

export function CaltraWelcome({ labels }: CaltraChatSlotProps) {
  return <div className="caltra-chat__welcome" data-caltra-state="empty">
    <h2>{labels.welcomeTitle}</h2>
    {labels.welcomeDescription && <p>{labels.welcomeDescription}</p>}
  </div>;
}

export function CaltraHistoryLoading({ labels }: CaltraChatSlotProps) {
  return <div className="caltra-chat__loading" role="status" data-caltra-state="loading">
    <span>{labels.loading}</span>
    <div className="caltra-chat__skeleton" aria-hidden="true"><i /><i /><i /></div>
  </div>;
}

export function CaltraMessage({ labels }: CaltraChatSlotProps) {
  const role = useAuiState((state) => state.message.role);
  return <MessagePrimitive.Root className="caltra-chat__message" data-role={role}>
    <span className="caltra-chat__sr-only">{role === "user" ? labels.user : labels.assistant}</span>
    <div className="caltra-chat__message-body">
      <MessagePrimitive.Parts components={{ Text: CaltraMarkdown }} />
      <AuiIf condition={(state) => state.message.status?.type === "incomplete"}>
        <p className="caltra-chat__message-error" role="alert">{labels.messageFailed}</p>
      </AuiIf>
    </div>
    {role === "assistant" && <ActionBarPrimitive.Root className="caltra-chat__actions" hideWhenRunning>
      <ActionBarPrimitive.Copy className="caltra-chat__copy" aria-label={labels.copy}>
        <AuiIf condition={(state) => !state.message.isCopied}>{labels.copy}</AuiIf>
        <AuiIf condition={(state) => state.message.isCopied}>{labels.copied}</AuiIf>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>}
  </MessagePrimitive.Root>;
}

function CaltraMarkdown() {
  return <MarkdownTextPrimitive className="caltra-chat__markdown" remarkPlugins={[remarkGfm]} />;
}

export function CaltraComposer({ labels, submitMode }: CaltraComposerProps) {
  return <ComposerPrimitive.Root className="caltra-chat__composer">
    <ComposerPrimitive.Input className="caltra-chat__input" aria-label={labels.messageInput} placeholder={labels.placeholder} rows={1} submitMode={submitMode} />
    <ComposerPrimitive.Send className="caltra-chat__send" aria-label={labels.send}><span aria-hidden="true">↑</span></ComposerPrimitive.Send>
  </ComposerPrimitive.Root>;
}

export function CaltraConnection({ labels, connection, error, historyLoaded, retry }: CaltraConnectionProps) {
  const [retrying, setRetrying] = useState(false);
  if (connection === "connected" && !error) return null;
  // Initial loading has its own single status region. Errors must never masquerade as an empty chat.
  if (!historyLoaded && !error && connection !== "failed") return null;
  return <div className="caltra-chat__connection" role={error || connection === "failed" ? "alert" : "status"}>
    <span>{error || connection === "failed" ? labels.connectionFailed : connection === "recovering" ? labels.recovering : labels.connecting}</span>
    {(connection === "failed" || (connection === "connected" && error)) && <button type="button" disabled={retrying} onClick={() => {
      setRetrying(true);
      void retry().catch(() => undefined).finally(() => setRetrying(false));
    }}>{labels.retry}</button>}
  </div>;
}
