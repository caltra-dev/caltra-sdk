"use client";

import { CaltraReasoning, type CaltraReasoningDisplay, type CaltraReasoningProps } from "./reasoning.js";

import {
  ActionBarPrimitive, AssistantRuntimeProvider, AuiIf,
  ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState, type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType, type ComponentPropsWithoutRef } from "react";
import { CaltraSessionRuntime } from "@caltra/client";
import { useAssistantUiRuntime } from "@caltra/assistant-ui";
import { type UseCaltraRuntimeOptions, type UseCaltraRuntimeResult } from "../use_caltra_runtime.js";
import { caltraThemes, type CaltraColorMode, type CaltraTheme, type CaltraThemeName } from "../themes/index.js";
import { themeStyle, type CaltraChatStyle } from "./theme_style.js";
import { defaultCaltraChatLabels, type CaltraChatLabels } from "./labels.js";

import { LazyTool } from "./lazy_tool.js";
import { ToolFallback } from "./assistant-ui/tool-fallback.js";
import { MarkdownText } from "./assistant-ui/markdown-text.js";
import { Composer } from "./assistant-ui/composer.js";

const ToolContext = createContext<{ labels: CaltraChatLabels; session?: CaltraSessionRuntime; Tool?: ComponentType<ToolCallMessagePartProps>; reasoningDisplay?: CaltraReasoningDisplay; Reasoning?: ComponentType<CaltraReasoningProps> }>({ labels: defaultCaltraChatLabels });

export interface CaltraChatSlotProps { labels: CaltraChatLabels; }
export type CaltraComposerInputProps = Omit<ComponentPropsWithoutRef<typeof ComposerPrimitive.Input>, "children" | "asChild" | "submitOnEnter">;
export type CaltraViewportProps = Omit<ComponentPropsWithoutRef<typeof ThreadPrimitive.Viewport>, "children" | "asChild" | "hidden">;
export interface CaltraComposerProps extends CaltraChatSlotProps {
  submitMode: "enter" | "ctrlEnter" | "none";
  inputProps?: CaltraComposerInputProps;
}
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
  Reasoning?: ComponentType<CaltraReasoningProps>;
}

export type CaltraChatSource =
  | (UseCaltraRuntimeOptions & { runtime?: never })
  | { runtime: CaltraSessionRuntime; client?: never; sessionId?: never };

export interface CaltraChatPresentationProps {
  /** Fetching is disclosure-owned. Hidden opens no reasoning stream. */
  reasoningDisplay?: CaltraReasoningDisplay;
  /** Upstream assistant-ui options, applied over Caltra's presentation defaults. */
  slotProps?: { viewport?: CaltraViewportProps; composerInput?: CaltraComposerInputProps };
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

export type CaltraChatProps = CaltraChatSource & CaltraChatPresentationProps;

/** Styled chat with safe loading/empty states. The @caltra/react/ui entry loads its scoped CSS. */
export function CaltraChat(props: CaltraChatProps) {
  // An identity change must discard both the adapter repository and composer draft atomically.
  const Session = useMemo(() => function Session(next: CaltraChatProps) {
    return <ChatSession {...next} />;
  }, [props.client, props.sessionId, props.runtime]);
  return <Session {...props} />;
}

function ChatSession(props: CaltraChatProps) {
  const { labels: overrides, components = {}, className, style, hidden, theme = "assistant-ui",
    colorMode = "system", submitMode = "enter", slotProps = {} } = props;
  const session = useMemo(() => props.runtime ?? new CaltraSessionRuntime(props.client!, props.sessionId!),
    [props.runtime, props.client, props.sessionId]);
  useEffect(() => {
    if (props.runtime) return; // Supplied runtimes belong to the caller, including their connection lifetime.
    void session.start().catch(() => undefined);
    return () => { void session.stop(); };
  }, [session, props.runtime]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const runtime = useAssistantUiRuntime(session);
  const caltra = { ...snapshot, runtime, reconnect: () => session.reconnect() };
  const viewport = slotProps.viewport ?? {};
  const resolvedTheme = typeof theme === "string" ? caltraThemes[theme] : theme;
  const labels = useMemo(() => ({ ...defaultCaltraChatLabels, ...overrides }), [overrides]);
  const { Welcome = CaltraWelcome, Loading = CaltraHistoryLoading, Message = CaltraMessage,
    Composer = CaltraComposer, Connection = CaltraConnection } = components;

  return <AssistantRuntimeProvider runtime={caltra.runtime}>
    <ToolContext.Provider value={{ labels, session, Tool: components.Tool, reasoningDisplay: hidden ? "hidden" : (props.reasoningDisplay ?? "hidden"), Reasoning: components.Reasoning }}>
    <ThreadPrimitive.Root className={`caltra-chat${className ? ` ${className}` : ""}`} style={{ ...themeStyle(resolvedTheme), ...style }} data-theme={resolvedTheme.name} data-color-mode={colorMode} hidden={hidden} aria-label={labels.chat}>
      <Connection labels={labels} connection={caltra.connection} error={caltra.error} historyLoaded={caltra.historyLoaded} retry={caltra.reconnect} />
      {!caltra.historyLoaded && caltra.connection !== "failed" && <Loading labels={labels} />}
      <ThreadPrimitive.Viewport {...viewport}
        onScroll={event => {
          viewport.onScroll?.(event);
          // Load only as the reader reaches the beginning; errors wait for explicit retry.
          // The native runtime coalesces requests and the viewport preserves the visible rows.
          if (!hidden && caltra.historyLoaded && !caltra.olderError && event.currentTarget.scrollTop <= 120 &&
            runtime.thread.getState().hasEarlier && !runtime.thread.getState().isLoadingEarlier) {
            void runtime.thread.loadEarlier();
          }
        }}
        className={`caltra-chat__viewport${viewport.className ? ` ${viewport.className}` : ""}`}
        autoScroll={viewport.autoScroll ?? true}
        scrollToBottomOnRunStart={viewport.scrollToBottomOnRunStart ?? false}
        hidden={!caltra.historyLoaded && caltra.connection !== "failed"}>
        <div className="caltra-chat__content">
          {caltra.historyLoaded && <>
            <AuiIf condition={state => state.thread.hasEarlier || state.thread.isLoadingEarlier}>
              <div className="caltra-chat__history-pagination">
                <AuiIf condition={state => state.thread.isLoadingEarlier}>
                  <div className="caltra-chat__skeleton caltra-chat__history-skeleton" role="status" aria-label={labels.olderLoading}>
                    {[0, 1].map(group => <div className="caltra-chat__skeleton-message" key={group} aria-hidden="true"><i /><i /></div>)}
                  </div>
                </AuiIf>
                {caltra.olderError && <>
                  <p role="alert">{labels.olderFailed}</p>
                  <ThreadPrimitive.LoadEarlier>{labels.retry}</ThreadPrimitive.LoadEarlier>
                </>}
              </div>
            </AuiIf>
            <AuiIf condition={(state) => state.thread.messages.length === 0 && !state.thread.isLoading}>
              <Welcome labels={labels} />
            </AuiIf>
            <div className="caltra-chat__messages"><ThreadPrimitive.Messages>{() => <Message labels={labels} />}</ThreadPrimitive.Messages></div>
          </>}
          <ThreadPrimitive.ViewportFooter className="caltra-chat__footer">
            <ThreadPrimitive.ScrollToBottom className="caltra-chat__scroll" aria-label={labels.scrollToBottom}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14m-7-7 7 7 7-7" /></svg>
            </ThreadPrimitive.ScrollToBottom>
            <Composer labels={labels} submitMode={submitMode} inputProps={slotProps.composerInput} />
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
  // Thread-wide running state must not remove controls from earlier completed messages.
  const isMessageRunning = useAuiState((state) => state.message.status?.type === "running");
  const { session, reasoningDisplay = "hidden" } = useContext(ToolContext);
  const hasReasoning = useAuiState(state => Boolean(state.message.metadata.custom?.caltraReasoning));
  const emptyCompleted = useAuiState((state) => state.message.role === "assistant"
    && state.message.status?.type === "complete"
    && !state.message.content.some((part) => part.type !== "text" || part.text !== ""));
  // Text-only transcripts can retain an empty checkpoint for a server-side tool call.
  if (emptyCompleted && (!hasReasoning || reasoningDisplay === "hidden")) return null;
  return <MessagePrimitive.Root className="caltra-chat__message" data-role={role}>
    <span className="caltra-chat__sr-only">{role === "user" ? labels.user : labels.assistant}</span>
    <div className="caltra-chat__message-body">
      {session && hasReasoning && <ReasoningRenderer session={session} />}
      <MessagePrimitive.Parts components={{ Text: MarkdownText, tools: { Fallback: ToolRenderer } }} />
      <AuiIf condition={(state) => state.message.status?.type === "incomplete"}>
        <p className="caltra-chat__message-error" role="alert">{labels.messageFailed}</p>
      </AuiIf>
    </div>
    {role === "assistant" && hasCopyableText && !isMessageRunning && <ActionBarPrimitive.Root className="caltra-chat__actions">
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
  const { session, labels } = useContext(ToolContext);
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
  if (session && artifact && typeof artifact === "object" && "caltraToolDetailsLoaded" in artifact
    && artifact.caltraToolDetailsLoaded === false && "caltraMessageId" in artifact && typeof artifact.caltraMessageId === "string") {
    return <LazyTool {...props} status={status} session={session} messageId={artifact.caltraMessageId}
      lifecycle={String(lifecycle)} labels={labels} />;
  }
  return <ToolFallback {...props} status={status} />;
}

export function CaltraComposer({ labels, submitMode, inputProps }: CaltraComposerProps) {
  return <Composer labels={labels} submitMode={submitMode} inputProps={inputProps} />;
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

/** Adapts the text-free reasoning metadata to Caltra's separately loaded disclosure. */
function ReasoningRenderer({ session }: { session: CaltraSessionRuntime }) {
  const { labels, reasoningDisplay = "hidden", Reasoning = CaltraReasoning } = useContext(ToolContext);
  const messageId = useAuiState(state => state.message.id);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const metadata = snapshot.messages.find(message => message.id === messageId)?.reasoning;
  if (!metadata) return null;
  return <Reasoning session={session} messageId={messageId} status={metadata.status} display={reasoningDisplay} labels={labels} />;
}
