"use client";

import { CaltraReasoning, type CaltraReasoningDisplay, type CaltraReasoningProps } from "./reasoning.js";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive, ThreadPrimitive, useAuiState, type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType, type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { CaltraSessionRuntime, type CaltraMessageContext } from "@caltra/client";
import { useAssistantUiRuntime, useCaltraReasoningMessages } from "@caltra/assistant-ui";
import { type UseCaltraRuntimeOptions, type UseCaltraRuntimeResult } from "../use_caltra_runtime.js";
import { caltraThemes, type CaltraColorMode, type CaltraTheme, type CaltraThemeName } from "../themes/index.js";
import { themeStyle, type CaltraChatStyle } from "./theme_style.js";
import { defaultCaltraChatLabels, type CaltraChatLabels } from "./labels.js";
import { italian } from "./italian-labels.js";

import { LazyTool } from "./lazy_tool.js";
import { ToolFallback } from "./upstream/components/assistant-ui/elements/tool-fallback.aui.js";
import { Thread, AssistantMessage, UserMessage, ThreadWelcome, ThreadHistorySkeleton, Composer, type ThreadComponents } from "./upstream/components/assistant-ui/elements/thread.aui.js";
import { ThreadLocaleProvider, ThreadTextOverrides, type ThreadLocale, type ThreadLabel } from "./upstream/lib/thread-i18n.js";
import { ThreadPortalContainer } from "./upstream/lib/portal-container.js";
import { PopoverPortalContainer } from "./upstream/components/ui/popover.js";

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
  /** Inserts controls without replacing the native composer. */
  ComposerControls?: ComponentType;
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
  /** Native presentation locale; explicit labels take precedence. */
  locale?: ThreadLocale;
  autoFocus?: boolean;
  /** Snapshot application data with each send; not returned in the visible transcript. */
  getContext?: () => CaltraMessageContext | undefined;
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


const ChatSlots = createContext<{ labels: CaltraChatLabels; components: CaltraChatComponents; submitMode: CaltraComposerProps["submitMode"]; inputProps?: CaltraComposerInputProps }>({ labels: defaultCaltraChatLabels, components: {}, submitMode: "enter" });
const threadStyle = { "--thread-max-width": "var(--caltra-content-width, var(--caltra-theme-content-width, 44rem))" } as CSSProperties;
const emptyComponents: CaltraChatComponents = {};

function ChatSession(props: CaltraChatProps) {
  const { components = emptyComponents, className, style, hidden, theme = "assistant-ui", colorMode = "system", submitMode = "enter", slotProps = {} } = props;
  const session = useMemo(() => props.runtime ?? new CaltraSessionRuntime(props.client!, props.sessionId!), [props.runtime, props.client, props.sessionId]);
  useEffect(() => {
    if (props.runtime) return;
    void session.start().catch(() => undefined);
    return () => { void session.stop(); };
  }, [session, props.runtime]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const runtime = useAssistantUiRuntime(session, { getContext: props.getContext });
  const labels = useMemo(() => ({ ...defaultCaltraChatLabels, ...(props.locale === "it" ? italian : {}), ...props.labels }), [props.labels, props.locale]);
  const resolvedTheme = typeof theme === "string" ? caltraThemes[theme] : theme;
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const dark = colorMode === "dark" || (colorMode === "system" && systemDark);
  // Streaming changes runtime state, not presentation configuration. Stable contexts
  // let native selectors update the affected parts without rerendering every slot.
  const nativeComponents = useMemo<ThreadComponents>(() => ({
    AssistantMessage: AssistantSlot,
    UserMessage: components.Message ? MessageSlot : undefined,
    Welcome: components.Welcome || props.labels?.welcomeDescription ? WelcomeSlot : undefined,
    Loading: components.Loading ? LoadingSlot : undefined,
    Composer: components.Composer ? ComposerSlot : undefined,
    ComposerControls: components.ComposerControls,
    ToolFallback: ToolRenderer,
  }), [components, props.labels?.welcomeDescription]);
  const textOverrides = useMemo(() => nativeLabels(props.labels), [props.labels]);
  const slots = useMemo(() => ({ labels, components, submitMode, inputProps: slotProps.composerInput }), [labels, components, submitMode, slotProps.composerInput]);
  const toolSettings = useMemo(() => ({ labels, session, Tool: components.Tool,
    reasoningDisplay: hidden ? "hidden" as const : (props.reasoningDisplay ?? "hidden"), Reasoning: components.Reasoning }),
  [labels, session, components.Tool, components.Reasoning, hidden, props.reasoningDisplay]);
  const thread = useMemo(() => <Thread components={nativeComponents} autoFocus={props.autoFocus} rootStyle={threadStyle}
    viewportProps={slotProps.viewport} composerInputProps={slotProps.composerInput} submitMode={submitMode} />,
  [nativeComponents, props.autoFocus, slotProps.viewport, slotProps.composerInput, submitMode]);
  const Connection = components.Connection ?? CaltraConnection;
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadLocaleProvider value={props.locale ?? "en"}><ThreadTextOverrides.Provider value={textOverrides}>
    <ChatSlots.Provider value={slots}>
    <ToolContext.Provider value={toolSettings}>
    <ThreadPortalContainer.Provider value={container}><PopoverPortalContainer.Provider value={container}>
      <div ref={setContainer} className={`caltra-chat${dark ? " dark" : ""}${className ? ` ${className}` : ""}`} style={{ ...themeStyle(resolvedTheme), ...style }} data-theme={resolvedTheme.name} data-color-mode={colorMode} hidden={hidden} aria-label={labels.chat} lang={props.locale}>
        <Connection labels={labels} connection={snapshot.connection} error={snapshot.error} historyLoaded={snapshot.historyLoaded} retry={() => session.reconnect()} />
        {snapshot.olderError && <div className="caltra-chat__connection" role="alert">{labels.olderFailed}</div>}
        {thread}
      </div>
    </PopoverPortalContainer.Provider></ThreadPortalContainer.Provider>
    </ToolContext.Provider></ChatSlots.Provider></ThreadTextOverrides.Provider></ThreadLocaleProvider>
  </AssistantRuntimeProvider>;
}

/** Explicit caller labels adapt native strings; absent overrides keep upstream defaults. */
function nativeLabels(labels?: Partial<CaltraChatLabels>): Partial<Record<ThreadLabel, string>> {
  const map: Partial<Record<keyof CaltraChatLabels, ThreadLabel>> = {
    welcomeTitle: "How can I help you today?", placeholder: "Send a message...", messageInput: "Message input",
    send: "Send message", stop: "Stop generating", copy: "Copy", scrollToBottom: "Scroll to bottom",
    loading: "Loading conversation", loadOlder: "Load earlier messages", olderLoading: "Loading earlier messages",
    thought: "Reasoning", reasoningLoading: "Loading reasoning…", reasoningFailed: "Could not load reasoning.", retry: "Try again",
  };
  const result: Partial<Record<ThreadLabel, string>> = {};
  for (const [key, text] of Object.entries(labels ?? {})) {
    const native = map[key as keyof CaltraChatLabels];
    if (native && text !== undefined) result[native] = text;
  }
  return result;
}
function WelcomeSlot() { const { components, labels } = useContext(ChatSlots); const Component = components.Welcome ?? CaltraWelcome; return <Component labels={labels} />; }
function LoadingSlot() { const { components, labels } = useContext(ChatSlots); const Component = components.Loading!; return <Component labels={labels} />; }
function MessageSlot() { const { components, labels } = useContext(ChatSlots); const Component = components.Message!; return <Component labels={labels} />; }
function ComposerSlot() { const { components, ...props } = useContext(ChatSlots); const Component = components.Composer!; return <Component {...props} />; }
function AssistantSlot() { const { components, labels } = useContext(ChatSlots); return components.Message ? <MessageSlot /> : <CaltraMessage labels={labels} />; }

export function CaltraWelcome({ labels }: CaltraChatSlotProps) {
  return <ThreadTextOverrides.Provider value={nativeLabels(labels)}><ThreadWelcome />{labels.welcomeDescription && <p>{labels.welcomeDescription}</p>}</ThreadTextOverrides.Provider>;
}
export function CaltraHistoryLoading({ labels }: CaltraChatSlotProps) {
  return <ThreadTextOverrides.Provider value={nativeLabels(labels)}><ThreadHistorySkeleton /></ThreadTextOverrides.Provider>;
}
export function CaltraMessage(_props: CaltraChatSlotProps) {
  const role = useAuiState(state => state.message.role);
  const { session } = useContext(ToolContext);
  if (role === "user") return <UserMessage />;
  return <>{session && <ReasoningRenderer session={session} />}<AssistantMessage /></>;
}
export function CaltraComposer({ labels, submitMode, inputProps }: CaltraComposerProps) {
  return <ThreadTextOverrides.Provider value={nativeLabels(labels)}><Composer inputProps={inputProps} submitMode={submitMode} /></ThreadTextOverrides.Provider>;
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
  // assistant-ui derives a completed part from any result, even isError.
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
  const messages = useCaltraReasoningMessages();
  return <>{messages.map(message => <Reasoning key={message.messageId} session={session}
    {...message} display={reasoningDisplay} labels={labels} />)}</>;
}
