import { ExportedMessageRepository, type ThreadMessage, type ThreadMessageLike, type ToolCallMessagePart } from "@assistant-ui/react";
import type { CaltraSessionMessage } from "@caltra/client";

/** Projects execution steps into UI messages without changing the canonical transcript.
 * A user-delimited response stays one message from its first empty step through
 * thinking, tools and answer text. The native top anchor therefore never loses
 * its user/assistant pair between execution steps. Source resource IDs survive.
 */
export class MessageProjection {
  private readonly responseIds = new Map<string, string>();
  private groups = new Map<string, { source: readonly CaltraSessionMessage[]; running: boolean; message: ThreadMessageLike }>();
  private readonly converted = new WeakMap<ThreadMessageLike, ThreadMessage>();

  constructor(private readonly getMessageKey: (id: string) => string = id => id) {}

  static project(messages: readonly CaltraSessionMessage[], isRunning = false): ThreadMessageLike[] {
    return new MessageProjection().project(messages, isRunning);
  }

  /** Reuse native messages for untouched history while keeping an authoritative
   * repository, so removed optimistic inputs cannot become phantom branches.
   */
  repository(messages: readonly CaltraSessionMessage[], isRunning: boolean): ExportedMessageRepository {
    const projected = this.project(messages, isRunning);
    return { messages: projected.map((message, index) => {
      let converted = this.converted.get(message);
      if (!converted) {
        converted = ExportedMessageRepository.fromArray([message]).messages[0]!.message;
        this.converted.set(message, converted);
      }
      return { message: converted, parentId: index > 0 ? projected[index - 1]!.id! : null };
    }) };
  }

  project(messages: readonly CaltraSessionMessage[], isRunning = false): ThreadMessageLike[] {
    const groups: CaltraSessionMessage[][] = [];
    for (const message of messages) {
      const group = groups.at(-1);
      const previous = group?.at(-1);
      if (previous?.role === "assistant" && message.role === "assistant") {
        group!.push(message);
      } else {
        groups.push([message]);
      }
    }
    const retained = new Map<string, { source: readonly CaltraSessionMessage[]; running: boolean; message: ThreadMessageLike }>();
    const userKeys = new Set<string>();
    const result = groups.map((group, index) => {
      const first = group[0]!;
      const previous = groups[index - 1]?.[0];
      let id = this.getMessageKey(first.id);
      if (first.role === "user") userKeys.add(id);
      if (first.role === "assistant" && previous?.role === "user") {
        const parent = this.getMessageKey(previous.id);
        id = this.responseIds.get(parent) ?? id;
        this.responseIds.set(parent, id);
      }
      const running = isRunning && index === groups.length - 1;
      const cached = this.groups.get(id);
      const message = cached?.running === running && cached.source.length === group.length
        && group.every((source, position) => source === cached.source[position])
        ? cached.message : { ...MessageProjection.message(group, running), id };
      retained.set(id, { source: group, running, message });
      return message;
    });
    const last = messages.at(-1);
    if (isRunning && last?.role === "user") {
      const parent = this.getMessageKey(last.id);
      const id = this.responseIds.get(parent) ?? `caltra-response:${parent}`;
      this.responseIds.set(parent, id);
      // Supply the upcoming response ourselves so the native pending indicator
      // and its root keep their identity when the first server step arrives.
      const message = this.groups.get(id)?.message ?? {
        id, role: "assistant" as const, content: [], createdAt: new Date(last.created_at),
        status: { type: "running" as const },
      };
      retained.set(id, { source: [], running: true, message });
      result.push(message);
    }
    for (const parent of this.responseIds.keys()) if (!userKeys.has(parent)) this.responseIds.delete(parent);
    this.groups = retained;
    return result;
  }

  private static message(group: readonly CaltraSessionMessage[], isRunning: boolean): ThreadMessageLike {
    const first = group[0]!;
    const last = group.at(-1)!;
    const reasoningMessages = group.flatMap(message => message.reasoning
      ? [{ messageId: message.id, status: message.reasoning.status }] : []);
    const reasoning = reasoningMessages.length ? {
      status: reasoningMessages.some(message => message.status === "streaming") ? "streaming" : "completed",
    } : undefined;
    return {
      // Keep the ID stable while later tool steps stream into this group.
      id: first.id,
      createdAt: new Date(first.created_at),
      role: first.role,
      content: group.flatMap(message => [
        ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
        ...(message.tool_calls ?? []).map(tool => ({
          type: "tool-call" as const, toolCallId: tool.id, toolName: tool.name,
          args: (tool.arguments ?? {}) as ToolCallMessagePart["args"],
          argsText: tool.arguments === undefined ? "" : JSON.stringify(tool.arguments),
          ...(tool.status === "running" ? {} : { result: tool.result ?? null }),
          isError: tool.status === "failed" || tool.status === "cancelled",
          artifact: { caltraToolStatus: tool.status, caltraToolDetailsLoaded: tool.arguments !== undefined, caltraMessageId: message.id },
        })),
      ]),
      metadata: { custom: { caltraReasoning: reasoning, caltraReasoningMessages: reasoningMessages } },
      ...(first.role === "assistant" ? {
        // A completed model step is not the end of the response turn. Keep native
        // pending UI stable in tool/model gaps, while retaining terminal failures.
        status: last.status === "cancelled" || last.status === "failed"
          ? { type: "incomplete" as const, reason: last.status === "cancelled" ? "cancelled" as const : "error" as const }
          : isRunning || last.status === "streaming"
            ? { type: "running" as const }
            : { type: "complete" as const, reason: "stop" as const },
      } : {}),
    };
  }
}
