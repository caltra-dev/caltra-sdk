"use client";

import { useCaltraReasoning } from "@caltra/assistant-ui";
import type { CaltraSessionRuntime } from "@caltra/client";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./assistant-ui/collapsible.js";
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
  return <Collapsible className="caltra-chat__reasoning" open={open}
    onOpenChange={value => { if (display !== "expanded") setChoice({ display, status, open: value }); }}>
    <CollapsibleTrigger className="caltra-chat__reasoning-trigger" disabled={display === "expanded"}>
      {status === "streaming" ? <LoaderCircle className="caltra-chat__reasoning-spinner" aria-hidden="true" /> : null}
      <span>{status === "streaming" ? labels.thinking : labels.thought}</span>
      {display !== "expanded" && <ChevronDown className="caltra-chat__reasoning-chevron" aria-hidden="true" />}
    </CollapsibleTrigger>
    <CollapsibleContent className="caltra-chat__reasoning-content">
      {reasoning.loading && <DetailsLoading label={labels.reasoningLoading} />}
      {reasoning.error && <div role="alert">{labels.reasoningFailed} <button type="button" onClick={() => { void reasoning.retry(); }}>{labels.retry}</button></div>}
      {reasoning.parts.map(part => <p className="caltra-chat__reasoning-text" key={part.position}>{part.text}</p>)}
    </CollapsibleContent>
  </Collapsible>;
}
