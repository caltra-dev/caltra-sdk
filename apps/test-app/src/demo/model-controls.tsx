import { useEffect, useState } from "react";
import { CaltraApiError, type CaltraClient, type CaltraModelChoice, type CaltraSessionRuntime, type CaltraSessionSnapshot } from "@caltra/client";

/** Uses the session's allowed catalog; no hard-coded production model names or effort levels. */
export function ModelControls({ client, runtime, snapshot }: { client: CaltraClient; runtime: CaltraSessionRuntime; snapshot: CaltraSessionSnapshot }) {
  const [choices, setChoices] = useState<CaltraModelChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
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
  const selected = snapshot.modelSelection;
  const defaultChoice = choices.find(choice => choice.is_default);
  const models = [...new Map(choices.map(choice => [choice.platform_model_id, choice.model_name])).entries()];
  const levels = choices.filter(choice => choice.platform_model_id === selected?.platformModelId);
  const disabled = snapshot.isRunning || loading || Boolean(error) || choices.length === 0;
  return <>
    <label className="demo-appearance">Model
      <select aria-label="Model" disabled={disabled} value={selected?.platformModelId ?? ""} onChange={event => {
        const choice = choices.find(item => item.platform_model_id === event.target.value);
        runtime.setModelSelection(choice ? { platformModelId: choice.platform_model_id, reasoningLevel: choice.reasoning_level } : undefined);
      }}>
        <option value="">{loading ? "Loading models…" : defaultChoice ? `Session default: ${defaultChoice.model_name}` : "Session default"}</option>
        {models.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
    <label className="demo-appearance">Reasoning effort
      <select aria-label="Reasoning effort" disabled={disabled || !selected} value={selected?.reasoningLevel ?? "provider-default"} onChange={event => {
        if (selected) runtime.setModelSelection({ ...selected, reasoningLevel: event.target.value === "provider-default" ? null : event.target.value });
      }}>
        {!selected ? <option value="provider-default">{defaultChoice?.reasoning_level ?? "Session default"}</option>
          : levels.map(choice => <option key={choice.reasoning_level ?? "provider-default"} value={choice.reasoning_level ?? "provider-default"}>{choice.reasoning_level ?? "Provider default"}</option>)}
      </select>
    </label>
    <p className="demo-thinking-hint">{error ?? (choices.length === 0 && !loading ? "No selectable combinations are available for this session." : "Model and effort apply to your next message. Thinking display only changes visibility.")}
      {error && <button type="button" onClick={() => setReload(value => value + 1)}> Retry</button>}
    </p>
  </>;
}
