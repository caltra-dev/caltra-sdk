import type { ThreadMessageLike, ToolCallMessagePart } from "@assistant-ui/react";
import type { CaltraSessionMessage } from "@caltra/client";

/** Projects execution steps into UI messages without changing the canonical transcript.
 * Only adjacent tool-only steps coalesce; text, user messages and interrupted steps
 * remain boundaries. Original resource IDs survive for lazy tool/reasoning reads.
 */
export class MessageProjection {
  static project(messages: readonly CaltraSessionMessage[]): ThreadMessageLike[] {
    const groups: CaltraSessionMessage[][] = [];
    for (const message of messages) {
      const group = groups.at(-1);
      const previous = group?.at(-1);
      if (previous && previous.status === "completed"
        && this.isToolOnly(previous) && this.isToolOnly(message)) {
        group!.push(message);
      } else {
        groups.push([message]);
      }
    }
    return groups.map(group => this.message(group));
  }

  private static isToolOnly(message: CaltraSessionMessage): boolean {
    return message.role === "assistant" && message.text === "" && Boolean(message.tool_calls?.length);
  }

  private static message(group: readonly CaltraSessionMessage[]): ThreadMessageLike {
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
        status: last.status === "streaming"
          ? { type: "running" as const }
          : last.status === "completed"
            ? { type: "complete" as const, reason: "stop" as const }
            : { type: "incomplete" as const, reason: last.status === "cancelled" ? "cancelled" as const : "error" as const },
      } : {}),
    };
  }
}
