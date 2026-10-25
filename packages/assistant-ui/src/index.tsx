"use client";

import {
  ExportedMessageRepository,
  type AppendMessage,
  type AssistantRuntime,
  type ThreadMessage,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { CaltraMessageContext, CaltraSessionRuntime } from "@caltra/client";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { modelSelectionFromContext } from "./model_context.js";
import { MessageProjection } from "./message_projection.js";
/** Maps an already-started Caltra session runtime into assistant-ui. Never starts or stops it. */
export interface AssistantUiRuntimeOptions {
  /** Evaluated synchronously for each send, never for transcript rendering. */
  getContext?: () => CaltraMessageContext | undefined;
}

export function useAssistantUiRuntime(store: CaltraSessionRuntime, { getContext }: AssistantUiRuntimeOptions = {}): AssistantRuntime {
  const runtimeRef = useRef<AssistantRuntime | null>(null);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    if (text === "") throw new Error("Caltra currently accepts text messages only.");
    const modelSelection = modelSelectionFromContext(runtimeRef.current?.thread.getModelContext());
    await store.send(text, { context: getContext?.(), modelSelection });
  }, [store, getContext]);

  const messages = useMemo(() => MessageProjection.project(snapshot.messages, snapshot.isRunning), [snapshot.messages, snapshot.isRunning]);

  // Caltra owns a linear transcript. Replace the repository so removed optimistic
  // IDs cannot survive as phantom edit/regeneration branches in assistant-ui.
  const messageRepository = useMemo(() => ExportedMessageRepository.fromArray(messages), [messages]);
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    isLoading: !snapshot.historyLoaded,
    isRunning: snapshot.isRunning,
    hasEarlier: snapshot.hasOlderMessages,
    // Caltra owns cursors/errors; assistant-ui owns loading state and prepend anchoring.
    onLoadEarlier: () => store.loadOlder().catch(() => undefined),
    isSendDisabled: snapshot.connection !== "connected",
    messageRepository,
    onNew,
    // assistant-ui calls this from its native Cancel primitive. The store exposes
    // failures via the existing alert; avoid an unhandled event-handler rejection.
    onCancel: async () => { await store.cancel().catch(() => undefined); },
  });

  runtimeRef.current = runtime;
  return runtime;
}

export { useCaltraReasoning, useCaltraReasoningMessages } from "./use_reasoning.js";
