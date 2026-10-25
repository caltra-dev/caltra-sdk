"use client";

import { useCaltraReasoning } from "@caltra/assistant-ui";
import type { CaltraSessionRuntime } from "@caltra/client";
import { useState } from "react";
import { ReasoningRoot, ReasoningTrigger, ReasoningContent, ReasoningText } from "./upstream/components/assistant-ui/elements/reasoning.aui.js";
import type { CaltraChatLabels } from "./labels.js";
import { DetailsLoading } from "./details_loading.js";

export type CaltraReasoningDisplay = "hidden" | "auto" | "collapsed" | "expanded";
export interface CaltraReasoningProps {
  session: CaltraSessionRuntime;
  messageId: string;
  status: "streaming" | "completed";
  display: CaltraReasoningDisplay;
  labels: CaltraChatLabels;
}

/** Accessible disclosure with independent loading; auto follows the thinking phase, not answer streaming. */
export function CaltraReasoning({ session, messageId, status, display, labels }: CaltraReasoningProps) {
  const [choice, setChoice] = useState<{ display: CaltraReasoningDisplay; status: string; open: boolean }>();
  const selected = choice?.display === display && (display !== "auto" || choice.status === status) ? choice.open : undefined;
  const open = display === "expanded" || (display !== "hidden" && (selected ?? (display === "auto" && status === "streaming")));
  const reasoning = useCaltraReasoning(session, messageId, open);
  if (display === "hidden") return null;
  return <div className="px-2"><ReasoningRoot open={open} streaming={status === "streaming"}
    onOpenChange={value => { if (display !== "expanded") setChoice({ display, status, open: value }); }}>
    <ReasoningTrigger active={status === "streaming"} disabled={display === "expanded"} />
    <ReasoningContent aria-busy={reasoning.loading}>
      <ReasoningText>
      {reasoning.loading && !reasoning.parts.some(part => part.text.length > 0) && <DetailsLoading label={labels.reasoningLoading} />}
      {reasoning.error && <div role="alert">{labels.reasoningFailed} <button type="button" onClick={() => { void reasoning.retry(); }}>{labels.retry}</button></div>}
      {reasoning.parts.map(part => <p key={part.position}>{part.text}</p>)}
      </ReasoningText>
    </ReasoningContent>
  </ReasoningRoot></div>;
}
