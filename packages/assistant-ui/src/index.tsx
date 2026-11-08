"use client";

import {
  type AppendMessage,
  type AssistantRuntime,
  type ThreadMessage,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { CaltraMessageContext, CaltraSessionRuntime } from "@caltra/client";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { modelSelectionFromContext } from "./model_context.js";
import { MessageProjection } from "./message_projection.js";
import { CaltraAttachmentAdapter } from "./attachment_adapter.js";
/** Maps an already-started Caltra session runtime into assistant-ui. Never starts or stops it. */
export interface AssistantUiRuntimeOptions {
  /** Hold the initial conversation skeleton while caller-owned controls initialize. */
  initializing?: boolean;
  /** Evaluated synchronously for each send, never for transcript rendering. */
  getContext?: () => CaltraMessageContext | undefined;
}

export function useAssistantUiRuntime(store: CaltraSessionRuntime, { getContext, initializing = false }: AssistantUiRuntimeOptions = {}): AssistantRuntime {
  const runtimeRef = useRef<AssistantRuntime | null>(null);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const attachmentAdapter = useMemo(() => new CaltraAttachmentAdapter(store), [store]);
  const uploading = useSyncExternalStore(attachmentAdapter.subscribe, attachmentAdapter.isSendBlocked, attachmentAdapter.isSendBlocked);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const attachments = message.attachments?.map(attachment => ({ id: attachment.id, name: attachment.name,
      media_type: attachment.contentType ?? "application/octet-stream", size_bytes: attachment.file?.size ?? 0 }));
    if (text === "" && !attachments?.length) throw new Error("A message or attachment is required.");
    const modelSelection = modelSelectionFromContext(runtimeRef.current?.thread.getModelContext());
    await store.send(text, { context: getContext?.(), modelSelection, attachments });
  }, [store, getContext]);

  const projection = useMemo(() => new MessageProjection(store.getMessageKey), [store]);
  const messageRepository = useMemo(() => projection.repository(snapshot.messages, snapshot.isRunning),
    [projection, snapshot.messages, snapshot.isRunning]);
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    // Session metadata is published only after attachment settings have resolved.
    isLoading: !snapshot.historyLoaded || snapshot.session === null || initializing,
    isRunning: snapshot.isRunning,
    hasEarlier: snapshot.hasOlderMessages,
    // Caltra owns cursors/errors; assistant-ui owns loading state and prepend anchoring.
    onLoadEarlier: () => store.loadOlder().catch(() => undefined),
    isSendDisabled: snapshot.connection !== "connected" || uploading,
    adapters: { attachments: snapshot.attachmentsEnabled ? attachmentAdapter : undefined },
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
