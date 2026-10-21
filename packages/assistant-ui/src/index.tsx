"use client";

import {
  ExportedMessageRepository,
  type AppendMessage,
  type AssistantRuntime,
  type ThreadMessageLike,
  type ThreadMessage,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { CaltraSessionRuntime } from "@caltra/client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
/** Maps an already-started Caltra session runtime into assistant-ui. Never starts or stops it. */
export function useAssistantUiRuntime(store: CaltraSessionRuntime): AssistantRuntime {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    if (text === "") throw new Error("Caltra currently accepts text messages only.");
    await store.send(text);
  }, [store]);

  const messages = useMemo<ThreadMessageLike[]>(() => snapshot.messages.map((message) => ({
    content: [
      ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
      ...(message.tool_calls ?? []).map(tool => ({ type: "tool-call" as const, toolCallId: tool.id, toolName: tool.name,
        args: (tool.arguments ?? {}) as import("@assistant-ui/react").ToolCallMessagePart["args"], argsText: tool.arguments === undefined ? "" : JSON.stringify(tool.arguments),
        ...(tool.status === "running" ? {} : { result: tool.result ?? null }),
        isError: tool.status === "failed" || tool.status === "cancelled",
        // Keep per-tool lifecycle distinct from the enclosing assistant message.
        artifact: { caltraToolStatus: tool.status, caltraToolDetailsLoaded: tool.arguments !== undefined, caltraMessageId: message.id },
      })),
    ],
    createdAt: new Date(message.created_at),
    id: message.id,
    role: message.role,
    ...(message.role === "assistant" ? {
      status: message.status === "streaming"
        ? { type: "running" as const }
        : message.status === "completed"
          ? { type: "complete" as const, reason: "stop" as const }
          : { type: "incomplete" as const, reason: message.status === "cancelled" ? "cancelled" as const : "error" as const },
    } : {}),
  })), [snapshot.messages]);

  // Caltra owns a linear transcript. Replace the repository so removed optimistic
  // IDs cannot survive as phantom edit/regeneration branches in assistant-ui.
  const messageRepository = useMemo(() => ExportedMessageRepository.fromArray(messages), [messages]);
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    isLoading: !snapshot.historyLoaded,
    isRunning: snapshot.isRunning,
    isSendDisabled: snapshot.connection !== "connected",
    messageRepository,
    onNew,
    // assistant-ui calls this from its native Cancel primitive. The store exposes
    // failures via the existing alert; avoid an unhandled event-handler rejection.
    onCancel: async () => { await store.cancel().catch(() => undefined); },
  });

  return runtime;
}
