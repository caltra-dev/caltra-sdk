import { ModelSelector, type ModelOption } from "../upstream/components/assistant-ui/elements/model-selector.aui.js";
import { useEffect, useState } from "react";
import { CaltraApiError, type CaltraClient, type CaltraModelChoice, type CaltraSessionRuntime, type CaltraSessionSnapshot } from "@caltra/client";

/** Uses the session's allowed catalog; no hard-coded production model names or effort levels. */
export function ModelControls({ client, runtime, snapshot }: { client: CaltraClient; runtime: CaltraSessionRuntime; snapshot: CaltraSessionSnapshot }) {
  const [choices, setChoices] = useState<CaltraModelChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selection, setSelection] = useState<{ model: string; effort: string }>();
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(undefined);
    void client.getSessionModelChoices(runtime.sessionId).then(result => { if (active) setChoices(result.choices); }).catch(reason => {
      if (active) setError(reason instanceof CaltraApiError && reason.status === 404
        ? "This Caltra server does not yet expose model choices. The session default remains in use."
        : "Could not load permitted model choices. Retry before changing the selection.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, runtime, reload]);
  const defaultChoice = choices.find(choice => choice.is_default) ?? choices[0];
  const selected = choices.find(choice => choice.platform_model_id === selection?.model && (choice.reasoning_level ?? "provider-default") === selection.effort) ?? defaultChoice;
  const models: ModelOption[] = [...new Map(choices.map(choice => [choice.platform_model_id, choice.model_name])).entries()].map(([id, name]) => ({
    id, name,
    efforts: choices.filter(choice => choice.platform_model_id === id).map(choice => ({ id: choice.reasoning_level ?? "provider-default", name: choice.reasoning_level ?? "Provider default" })),
  }));
  const disabled = snapshot.isRunning || loading || Boolean(error) || choices.length === 0;
  return <>
    <div className="demo-model-control demo-appearance">
      <span>Model and reasoning</span>
      {selected ? <ModelSelector models={models} value={selected.platform_model_id} effort={selected.reasoning_level ?? "provider-default"}
        aria-label="Model and reasoning" disabled={disabled} open={!disabled && open} onOpenChange={setOpen}
        className="demo-model-trigger" contentClassName="demo-model-menu"
        onValueChange={model => {
          const first = choices.find(choice => choice.platform_model_id === model);
          if (first) setSelection({ model, effort: first.reasoning_level ?? "provider-default" });
        }}
        onEffortChange={effort => setSelection({ model: selected.platform_model_id, effort })} />
        : <button className="demo-model-trigger" type="button" disabled>{loading ? "Loading models…" : "Session default"}</button>}
    </div>
    <p className="demo-thinking-hint">{error ?? (choices.length === 0 && !loading ? "No selectable combinations are available for this session." : "Model and effort apply to your next message. Thinking display only changes visibility.")}
      {error && <button type="button" onClick={() => setReload(value => value + 1)}> Retry</button>}
    </p>
  </>;
}
