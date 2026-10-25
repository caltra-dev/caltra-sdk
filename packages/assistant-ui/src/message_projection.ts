import type { ThreadMessageLike, ToolCallMessagePart } from "@assistant-ui/react";
import type { CaltraSessionMessage } from "@caltra/client";

/** Projects execution steps into UI messages without changing the canonical transcript.
 * A user-delimited response stays one message from its first empty step through
 * thinking, tools and answer text. The native top anchor therefore never loses
 * its user/assistant pair between execution steps. Source resource IDs survive.
 */
export class MessageProjection {
  static project(messages: readonly CaltraSessionMessage[], isRunning = false): ThreadMessageLike[] {
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
    return groups.map((group, index) => this.message(group, isRunning && index === groups.length - 1));
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
