import { ModelControls } from "./model-controls.js";
import { ThreadLocaleProvider, useThreadText, type ThreadLocale } from "../upstream/lib/thread-i18n.js";
import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";
import { useCaltraReasoning, useCaltraReasoningMessages } from "@caltra/assistant-ui";
import type { CaltraSessionRuntime } from "@caltra/client";
import type { CaltraReasoningDisplay } from "@caltra/react/ui";
import { createContext, useContext, useState } from "react";
import { AssistantMessage, Thread } from "../upstream/components/assistant-ui/elements/thread.aui.js";
import { ReasoningRoot, ReasoningTrigger, ReasoningContent, ReasoningText } from "../upstream/components/assistant-ui/elements/reasoning.aui.js";

type Settings = { session: CaltraSessionRuntime; display: CaltraReasoningDisplay };
const ReasoningSettings = createContext<Settings | null>(null);

function CaltraThreadMessage() {
  const settings = useContext(ReasoningSettings)!;
  const reasoningMessages = useCaltraReasoningMessages();
  return <>
    {reasoningMessages.map(message => <ThreadReasoning key={message.messageId} {...settings} {...message} />)}
    <AssistantMessage />
  </>;
}

/** Adapt Caltra's lazy resource without replacing upstream's message presentation. */
function ThreadReasoning({ session, display, messageId, status }: Settings & { messageId: string; status: "streaming" | "completed" }) {
  const t = useThreadText();
  const [choice, setChoice] = useState<{ display: CaltraReasoningDisplay; status: string; open: boolean }>();
  const selected = choice?.display === display && (display !== "auto" || choice.status === status) ? choice.open : undefined;
  const open = display === "expanded" || (display !== "hidden" && (selected ?? (display === "auto" && status === "streaming")));
  const reasoning = useCaltraReasoning(session, messageId, open);
  if (display === "hidden") return null;
  return <div className="px-2">
    <ReasoningRoot open={open} streaming={status === "streaming"}
      onOpenChange={value => { if (display !== "expanded") setChoice({ display, status, open: value }); }}>
      <ReasoningTrigger active={status === "streaming"} disabled={display === "expanded"} />
      <ReasoningContent aria-busy={reasoning.loading}>
        <ReasoningText>
          {reasoning.loading && !reasoning.parts.some(part => part.text) && <p role="status">{t("Loading reasoning…")}</p>}
          {reasoning.error && <p role="alert">{t("Could not load reasoning.")}{" "}<button type="button" onClick={() => { void reasoning.retry(); }}>{t("Try again")}</button></p>}
          {reasoning.parts.map(part => <p key={part.position}>{part.text}</p>)}
        </ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  </div>;
}

const components = { AssistantMessage: CaltraThreadMessage, ComposerControls: ModelControls };
export function SignalThread({ session, display, runtime, locale }: Settings & { runtime: AssistantRuntime; locale: ThreadLocale }) {
  return <ThreadLocaleProvider value={locale}><ReasoningSettings.Provider value={{ session, display }}>
    <AssistantRuntimeProvider runtime={runtime}><Thread autoFocus={false} components={components} /></AssistantRuntimeProvider>
  </ReasoningSettings.Provider></ThreadLocaleProvider>;
}
