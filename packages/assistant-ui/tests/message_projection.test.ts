import { describe, expect, it } from "vitest";
import type { CaltraSessionMessage } from "@caltra/client";
import { MessageProjection } from "../src/message_projection.js";

const step = (id: string, overrides: Partial<CaltraSessionMessage> = {}): CaltraSessionMessage => ({
  id, role: "assistant", status: "completed", text: "", created_at: "2026-10-24T00:00:00Z",
  tool_calls: [{ id: `tool-${id}`, name: "demo.read", status: "completed" }], ...overrides,
});

describe("tool step projection", () => {
  it("coalesces tool-only steps and retains each lazy resource identity without mutating history", () => {
    const source = [step("one"), step("two"), step("three")];
    const original = structuredClone(source);
    const result = MessageProjection.project(source);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("one");
    expect(result[0]?.content).toEqual(source.map(message => expect.objectContaining({
      toolCallId: `tool-${message.id}`, artifact: expect.objectContaining({
        caltraMessageId: message.id, caltraToolDetailsLoaded: false,
      }),
    })));
    expect(source).toEqual(original);
  });

  it("keeps one response across text, empty and reasoning-only steps, bounded by user messages", () => {
    const source = [step("one"), step("two"),
      step("text", { text: "Checking another source" }), step("three"),
      step("user", { role: "user", text: "Next question", tool_calls: undefined }), step("four"),
      step("thinking", { tool_calls: undefined, reasoning: { status: "completed" } }), step("five"),
      step("empty", { tool_calls: undefined }), step("six")];
    const result = MessageProjection.project(source);
    expect(result.map(message => message.id)).toEqual(["one", "user", "four"]);
    expect(result[0]?.content).toEqual([
      expect.objectContaining({ toolCallId: "tool-one" }), expect.objectContaining({ toolCallId: "tool-two" }),
      { type: "text", text: "Checking another source" }, expect.objectContaining({ toolCallId: "tool-text" }),
      expect.objectContaining({ toolCallId: "tool-three" }),
    ]);
  });

  it("keeps a stable group identity through streaming and completion and retains failed tool status", () => {
    const first = step("one");
    const running = step("two", { status: "streaming", tool_calls: [{ id: "tool-two", name: "demo.read", status: "running" }] });
    const projected = MessageProjection.project([first, running]);
    expect(projected[0]).toMatchObject({ id: "one", status: { type: "running" } });
    expect(projected[0]?.content?.[1]).not.toHaveProperty("result");
    const finished = step("two", { tool_calls: [{ id: "tool-two", name: "demo.read", status: "failed", arguments: { source: 2 }, result: { error: "unavailable" } }] });
    expect(MessageProjection.project([first, finished])[0]).toMatchObject({
      id: "one", status: { type: "complete" }, content: [expect.anything(), expect.objectContaining({
        isError: true, args: { source: 2 }, result: { error: "unavailable" },
        artifact: { caltraMessageId: "two", caltraToolDetailsLoaded: true, caltraToolStatus: "failed" },
      })],
    });
  });

  it.each(["cancelled", "failed"] as const)("preserves %s status before the next user turn", status => {
    const result = MessageProjection.project([step("one"), step("two", { status }),
      step("user", { role: "user", text: "Try again", tool_calls: undefined }), step("three")]);
    expect(result.map(message => message.id)).toEqual(["one", "user", "three"]);
    expect(result[0]).toMatchObject({ status: { type: "incomplete", reason: status === "cancelled" ? "cancelled" : "error" } });
  });

  it("keeps the response running between completed steps until the whole turn finishes", () => {
    const source = [step("one"), step("two")];
    expect(MessageProjection.project(source, true)[0]).toMatchObject({ id: "one", status: { type: "running" } });
    expect(MessageProjection.project(source, false)[0]).toMatchObject({ id: "one", status: { type: "complete" } });
    expect(MessageProjection.project([step("one", { status: "cancelled" })], true)[0]).toMatchObject({ status: { type: "incomplete", reason: "cancelled" } });
  });

  it("retains all reasoning resource IDs and their independent statuses", () => {
    const result = MessageProjection.project([
      step("one", { reasoning: { status: "completed" } }),
      step("two", { status: "streaming", reasoning: { status: "streaming" } }),
    ]);
    expect(result[0]?.metadata?.custom).toEqual({
      caltraReasoning: { status: "streaming" },
      caltraReasoningMessages: [{ messageId: "one", status: "completed" }, { messageId: "two", status: "streaming" }],
    });
  });
});
