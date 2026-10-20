"use client";

import {
  ActionBarPrimitive, AssistantRuntimeProvider, AuiIf,
  MessagePrimitive, ThreadPrimitive, useAuiState, type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { createContext, useContext, useMemo, useState, type ComponentType } from "react";
import { useCaltraRuntime, type UseCaltraRuntimeOptions, type UseCaltraRuntimeResult } from "../use_caltra_runtime.js";
import { caltraThemes, type CaltraColorMode, type CaltraTheme, type CaltraThemeName } from "../themes/index.js";
import { themeStyle, type CaltraChatStyle } from "./theme_style.js";
import { defaultCaltraChatLabels, type CaltraChatLabels } from "./labels.js";

import { ToolFallback } from "./assistant-ui/tool-fallback.js";
import { MarkdownText } from "./assistant-ui/markdown-text.js";
import { Composer } from "./assistant-ui/composer.js";

const ToolContext = createContext<{ labels: CaltraChatLabels; Tool?: ComponentType<ToolCallMessagePartProps> }>({ labels: defaultCaltraChatLabels });

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
  Tool?: ComponentType<ToolCallMessagePartProps>;
}

export interface CaltraChatProps extends UseCaltraRuntimeOptions {
  labels?: Partial<CaltraChatLabels>;
  components?: CaltraChatComponents;
  className?: string;
  style?: CaltraChatStyle;
  /** Named preset or a complete theme from createCaltraTheme. Defaults to assistant-ui. */
  theme?: CaltraThemeName | CaltraTheme;
  /** System follows prefers-color-scheme, including changes while the chat is mounted. */
  colorMode?: CaltraColorMode;
  /** Hide the panel without disposing its session or draft. */
  hidden?: boolean;
  submitMode?: CaltraComposerProps["submitMode"];
}

/** Styled chat with safe loading/empty states. The @caltra/react/ui entry loads its scoped CSS. */
export function CaltraChat({ client, sessionId, ...presentation }: CaltraChatProps) {
  // A new client is an authorization boundary. Remount atomically rather than briefly
  // rendering the old assistant-ui repository while a hook effect switches stores.
  const Session = useMemo(() => function Session(props: Omit<CaltraChatProps, "client" | "sessionId">) {
    return <ChatSession {...props} client={client} sessionId={sessionId} />;
  }, [client, sessionId]);
  return <Session {...presentation} />;
}

function ChatSession({ client, sessionId, labels: overrides, components = {}, className, style, hidden, theme = "assistant-ui", colorMode = "system", submitMode = "enter" }: CaltraChatProps) {
  const caltra = useCaltraRuntime({ client, sessionId });
  const resolvedTheme = typeof theme === "string" ? caltraThemes[theme] : theme;
  const labels = useMemo(() => ({ ...defaultCaltraChatLabels, ...overrides }), [overrides]);
  const { Welcome = CaltraWelcome, Loading = CaltraHistoryLoading, Message = CaltraMessage,
    Composer = CaltraComposer, Connection = CaltraConnection } = components;

  return <AssistantRuntimeProvider runtime={caltra.runtime}>
    <ToolContext.Provider value={{ labels, Tool: components.Tool }}>
    <ThreadPrimitive.Root className={`caltra-chat${className ? ` ${className}` : ""}`} style={{ ...themeStyle(resolvedTheme), ...style }} data-theme={resolvedTheme.name} data-color-mode={colorMode} hidden={hidden} aria-label={labels.chat}>
      <Connection labels={labels} connection={caltra.connection} error={caltra.error} historyLoaded={caltra.historyLoaded} retry={caltra.reconnect} />
      {!caltra.historyLoaded && caltra.connection !== "failed" && <Loading labels={labels} />}
      <ThreadPrimitive.Viewport className="caltra-chat__viewport" autoScroll hidden={!caltra.historyLoaded && caltra.connection !== "failed"}>
        <div className="caltra-chat__content">
          {caltra.historyLoaded && <>
            <AuiIf condition={(state) => state.thread.messages.length === 0 && !state.thread.isLoading}>
              <Welcome labels={labels} />
            </AuiIf>
            <div className="caltra-chat__messages"><ThreadPrimitive.Messages>{() => <Message labels={labels} />}</ThreadPrimitive.Messages></div>
          </>}
          <ThreadPrimitive.ViewportFooter className="caltra-chat__footer">
            <ThreadPrimitive.ScrollToBottom className="caltra-chat__scroll" aria-label={labels.scrollToBottom}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14m-7-7 7 7 7-7" /></svg>
            </ThreadPrimitive.ScrollToBottom>
            <Composer labels={labels} submitMode={submitMode} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
    </ToolContext.Provider>
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
    <span className="caltra-chat__sr-only">{labels.loading}</span>
    <div className="caltra-chat__skeleton" aria-hidden="true">
      {[0, 1, 2, 3].map(group => <div className="caltra-chat__skeleton-message" key={group}><i /><i /><i /></div>)}
    </div>
    <div className="caltra-chat__skeleton-composer" aria-hidden="true"><i /><span /></div>
  </div>;
}

export function CaltraMessage({ labels }: CaltraChatSlotProps) {
  const role = useAuiState((state) => state.message.role);
  const isCopied = useAuiState((state) => state.message.isCopied);
  const hasCopyableText = useAuiState((state) => state.message.content.some(part => part.type === "text" && part.text.length > 0));
  const emptyCompleted = useAuiState((state) => state.message.role === "assistant"
    && state.message.status?.type === "complete"
    && !state.message.content.some((part) => part.type !== "text" || part.text !== ""));
  // Text-only transcripts can retain an empty checkpoint for a server-side tool call.
  if (emptyCompleted) return null;
  return <MessagePrimitive.Root className="caltra-chat__message" data-role={role}>
    <span className="caltra-chat__sr-only">{role === "user" ? labels.user : labels.assistant}</span>
    <div className="caltra-chat__message-body">
      <MessagePrimitive.Parts components={{ Text: MarkdownText, tools: { Fallback: ToolRenderer } }} />
      <AuiIf condition={(state) => state.message.status?.type === "incomplete"}>
        <p className="caltra-chat__message-error" role="alert">{labels.messageFailed}</p>
      </AuiIf>
    </div>
    {role === "assistant" && hasCopyableText && <ActionBarPrimitive.Root className="caltra-chat__actions" hideWhenRunning>
      <ActionBarPrimitive.Copy className="caltra-chat__copy" aria-label={isCopied ? labels.copied : labels.copy} title={isCopied ? labels.copied : labels.copy}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          {isCopied ? <path d="m20 6-11 11-5-5" /> : <>
            <rect width="14" height="14" x="8" y="8" rx="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </>}
        </svg>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>}
  </MessagePrimitive.Root>;
}

function ToolRenderer(props: ToolCallMessagePartProps) {
  const { Tool } = useContext(ToolContext);
  return Tool ? <Tool {...props} /> : <CaltraTool {...props} />;
}

/** The upstream assistant-ui ToolFallback; retained under the existing public name. */
export function CaltraTool(props: ToolCallMessagePartProps) {
  const artifact = props.artifact;
  const lifecycle = artifact && typeof artifact === "object" && "caltraToolStatus" in artifact
    ? artifact.caltraToolStatus : undefined;
  // assistant-ui 0.15.16 derives a completed part from any result, even isError.
  // Normalize Caltra's durable per-call status at the boundary, not in upstream UI.
  const status: ToolCallMessagePartProps["status"] = lifecycle === "cancelled"
    ? { type: "incomplete", reason: "cancelled" }
    : lifecycle === "failed" || props.isError
      ? { type: "incomplete", reason: "error" }
      : lifecycle === "running"
        ? { type: "running" }
        : props.status;
  return <ToolFallback {...props} status={status} />;
}

export function CaltraComposer({ labels, submitMode }: CaltraComposerProps) {
  return <Composer labels={labels} submitMode={submitMode} />;
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
