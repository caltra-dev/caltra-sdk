"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import type { CaltraSessionRuntime, CaltraToolCall } from "@caltra/client";
import { useEffect, useState } from "react";
import { ToolFallback } from "./assistant-ui/tool-fallback.js";
import type { CaltraChatLabels } from "./labels.js";
import { DetailsLoading } from "./details_loading.js";

/** Adds read-on-expand behavior using upstream parts without changing assistant-ui's implementation. */
export function LazyTool(props: ToolCallMessagePartProps & {
  session: CaltraSessionRuntime; messageId: string; lifecycle: string; labels: CaltraChatLabels;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ details?: CaltraToolCall; error?: boolean }>({});
  useEffect(() => {
    if (!open) return;
    let active = true;
    setState({});
    void props.session.getToolDetails(props.messageId, props.toolCallId).then(
      details => { if (active) setState({ details }); },
      () => { if (active) setState({ error: true }); },
    );
    return () => { active = false; };
  }, [open, props.session, props.messageId, props.toolCallId, props.lifecycle, attempt]);
  return <ToolFallback.Root open={open} onOpenChange={setOpen}>
    <ToolFallback.Trigger toolName={props.toolName} status={props.status} />
    <ToolFallback.Content>
      <ToolFallback.Error status={props.status} />
      {!state.details && !state.error && <DetailsLoading label={props.labels.toolDetailsLoading} />}
      {state.error && <div role="alert">{props.labels.toolDetailsFailed} <button type="button" onClick={() => setAttempt(value => value + 1)}>{props.labels.retry}</button></div>}
      {state.details && <>
        <ToolFallback.Args argsText={JSON.stringify(state.details.arguments)} />
        <ToolFallback.Result result={state.details.result} />
      </>}
    </ToolFallback.Content>
  </ToolFallback.Root>;
}
