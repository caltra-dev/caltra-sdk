// @vitest-environment jsdom
import { AssistantRuntimeProvider, RuntimeAdapterProvider, useAui, ThreadPrimitive, MessagePrimitive, groupPartByType } from "@assistant-ui/react";
import { useEffect } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaltraSessionRuntime } from "@caltra/client";
import { useAssistantUiRuntime, useCaltraReasoningMessages } from "../src/index.js";

function fixture() {
  const close = vi.fn(async () => {});
  const client = {
    openSessionEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => {}); }, close })),
    listSessionMessages: vi.fn(async () => ({ data: [], next_cursor: null })),
    getSessionById: vi.fn(async () => ({ id: "session" })),
    sendMessage: vi.fn(async () => ({ message_id: "saved", turn_id: "turn" })),
    cancelSession: vi.fn(async () => ({ turn_id: "turn" })),
  };
  return { client, close, session: new CaltraSessionRuntime(client as never, "session") };
}

describe("useAssistantUiRuntime", () => {
  it("lets native GroupedParts count tools across steps and exposes every reasoning resource", async () => {
    const f = fixture();
    f.client.listSessionMessages.mockResolvedValueOnce({ data: ["one", "two", "three"].map(id => ({
      id, role: "assistant", text: "", status: "completed", created_at: "2026-10-24T00:00:00Z",
      tool_calls: [{ id: `tool-${id}`, name: "demo.read", status: "completed" }], reasoning: { status: "completed" },
    })), next_cursor: null } as never);
    const hook = renderHook(() => useAssistantUiRuntime(f.session));
    await act(() => f.session.start());
    function Message() {
      const reasoning = useCaltraReasoningMessages();
      return <>
        <span>{reasoning.map(message => message.messageId).join(",")}</span>
        <MessagePrimitive.GroupedParts groupBy={groupPartByType({ "tool-call": ["group-tool"] })}>
          {({ part }) => part.type === "group-tool" ? <output>{part.indices.length} tool calls</output> : null}
        </MessagePrimitive.GroupedParts>
      </>;
    }
    const view = render(<AssistantRuntimeProvider runtime={hook.result.current}>
      <ThreadPrimitive.Messages>{() => <Message />}</ThreadPrimitive.Messages>
    </AssistantRuntimeProvider>);
    expect(view.getAllByText("3 tool calls")).toHaveLength(1);
    expect(view.getByText("one,two,three")).toBeTruthy();
    view.unmount(); hook.unmount(); await f.session.stop();
  });
  it("regroups paginated tool steps without duplicates or phantom branches", async () => {
    const f = fixture();
    const step = (id: string) => ({ id, role: "assistant", text: "", status: "completed",
      created_at: "2026-10-24T00:00:00Z", tool_calls: [{ id: `tool-${id}`, name: "demo.read", status: "completed" }] });
    f.client.listSessionMessages.mockResolvedValueOnce({ data: [step("two"), step("three")], next_cursor: "older" } as never)
      .mockResolvedValueOnce({ data: [step("one")], next_cursor: null } as never);
    const hook = renderHook(() => useAssistantUiRuntime(f.session));
    await act(() => f.session.start());
    expect(hook.result.current.thread.getState().messages).toHaveLength(1);
    expect(hook.result.current.thread.getState().messages[0]?.content).toHaveLength(2);
    await act(() => hook.result.current.thread.loadEarlier());
    const messages = hook.result.current.thread.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("one");
    expect(messages[0]?.content).toHaveLength(3);
    expect(f.session.getSnapshot().messages).toHaveLength(3);
    hook.unmount(); await f.session.stop();
  });
  it("consumes native useAui ModelContext registration in both shared presentation adapters", async () => {
    const f = fixture();
    const id = "90000000-0000-4000-8000-000000000002";
    const primary = renderHook(() => useAssistantUiRuntime(f.session));
    const registration = renderHook(({ effort }) => {
      const aui = useAui();
      useEffect(() => aui.modelContext.register({ getModelContext: () => ({ config: { modelName: id, reasoningEffort: effort } }) }), [aui, effort]);
    }, { initialProps: { effort: "low" }, wrapper: ({ children }) => <AssistantRuntimeProvider runtime={primary.result.current}>{children}</AssistantRuntimeProvider> });
    const secondary = renderHook(() => useAssistantUiRuntime(f.session), { wrapper: ({ children }) => <RuntimeAdapterProvider adapters={{ modelContext: { getModelContext: () => primary.result.current.thread.getModelContext() } }}>{children}</RuntimeAdapterProvider> });
    await act(() => f.session.start());
    act(() => primary.result.current.thread.append("Primary"));
    await waitFor(() => expect(f.client.sendMessage).toHaveBeenLastCalledWith("session", { text: "Primary", modelSelection: { platformModelId: id, reasoningLevel: "low" } }));
    registration.rerender({ effort: "high" });
    act(() => secondary.result.current.thread.append("Secondary"));
    await waitFor(() => expect(f.client.sendMessage).toHaveBeenLastCalledWith("session", { text: "Secondary", modelSelection: { platformModelId: id, reasoningLevel: "high" } }));
    registration.unmount();
    act(() => primary.result.current.thread.append("Default"));
    await waitFor(() => expect(f.client.sendMessage).toHaveBeenLastCalledWith("session", { text: "Default" }));
    secondary.unmount(); primary.unmount(); await f.session.stop();
  });
  it("uses registered ModelContext for each send without changing the runtime default", async () => {
    const f = fixture();
    const id = "90000000-0000-4000-8000-000000000001";
    f.session.setModelSelection({ platformModelId: id, reasoningLevel: "low" });
    const hook = renderHook(() => useAssistantUiRuntime(f.session, { getContext: () => ({ page: "customer" }) }));
    await act(() => f.session.start());
    let effort = "high";
    const unregister = hook.result.current.registerModelContextProvider({ getModelContext: () => ({ config: { modelName: id, reasoningEffort: effort } }) });
    act(() => { hook.result.current.thread.append("First"); });
    await waitFor(() => expect(f.client.sendMessage).toHaveBeenLastCalledWith("session", { text: "First", modelSelection: { platformModelId: id, reasoningLevel: "high" }, context: { page: "customer" } }));
    effort = "provider-default";
    act(() => { hook.result.current.thread.append("Second"); });
    await waitFor(() => expect(f.client.sendMessage).toHaveBeenLastCalledWith("session", { text: "Second", modelSelection: { platformModelId: id, reasoningLevel: null }, context: { page: "customer" } }));
    unregister();
    act(() => { hook.result.current.thread.append("Third"); });
    await waitFor(() => expect(f.client.sendMessage).toHaveBeenLastCalledWith("session", { text: "Third", modelSelection: { platformModelId: id, reasoningLevel: "low" }, context: { page: "customer" } }));
    expect(f.session.getSnapshot().modelSelection).toEqual({ platformModelId: id, reasoningLevel: "low" });
    expect(JSON.stringify(f.session.getSnapshot().messages)).not.toContain(id);
    hook.unmount(); await f.session.stop();
  });
  it("reads the newest context callback at send time without replacing the session", async () => {
    const f = fixture();
    const hook = renderHook(({ id }) => useAssistantUiRuntime(f.session, { getContext: () => ({ page: { id } }) }), { initialProps: { id: "first" } });
    await act(() => f.session.start());
    hook.rerender({ id: "second" });
    act(() => { hook.result.current.thread.append("Explain this"); });
    await waitFor(() => expect(f.client.sendMessage).toHaveBeenCalledWith("session", { text: "Explain this", context: { page: { id: "second" } } }));
    expect(f.client.openSessionEvents).toHaveBeenCalledOnce();
    expect(JSON.stringify(hook.result.current.thread.getState().messages)).not.toContain('"second"');
    hook.unmount(); await f.session.stop();
  });
  it("exposes native earlier history and joins concurrent page requests", async () => {
    const f = fixture();
    let release!: (value: unknown) => void;
    const message = (id: string) => ({ id, role: "assistant", text: id, status: "completed", created_at: "2026-10-21T00:00:00Z" });
    f.client.listSessionMessages.mockResolvedValueOnce({ data: [message("latest")], next_cursor: "older" } as never)
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve as never; }));
    const hook = renderHook(() => useAssistantUiRuntime(f.session));
    await act(() => f.session.start());
    expect(hook.result.current.thread.getState().hasEarlier).toBe(true);
    let first!: Promise<void>; let second!: Promise<void>;
    act(() => {
      first = hook.result.current.thread.loadEarlier();
      second = hook.result.current.thread.loadEarlier();
    });
    expect(hook.result.current.thread.getState().isLoadingEarlier).toBe(true);
    await waitFor(() => expect(f.client.listSessionMessages).toHaveBeenCalledTimes(2));
    await act(async () => {
      release({ data: [message("earliest")], next_cursor: null });
      await Promise.all([first, second]);
    });
    expect(hook.result.current.thread.getState().messages.map(message => message.id)).toEqual(["earliest", "latest"]);
    expect(hook.result.current.thread.getState().hasEarlier).toBe(false);
    expect(hook.result.current.thread.getState().isLoadingEarlier).toBe(false);
    await act(() => hook.result.current.thread.loadEarlier());
    expect(f.client.listSessionMessages).toHaveBeenCalledTimes(2);
    hook.unmount(); await f.session.stop();
  });
  it("shares canonical messages and one connection without owning the caller's lifecycle", async () => {
    const f = fixture();
    const first = renderHook(() => useAssistantUiRuntime(f.session));
    const second = renderHook(() => useAssistantUiRuntime(f.session));
    expect(f.client.openSessionEvents).not.toHaveBeenCalled();
    await act(() => f.session.start());
    act(() => { first.result.current.thread.append("Hello"); });
    await waitFor(() => expect(second.result.current.thread.getState().messages[0]?.id).toBe("saved"));
    expect(second.result.current.thread.getState().messages[0]?.content).toEqual([{ type: "text", text: "Hello" }]);
    expect(f.client.openSessionEvents).toHaveBeenCalledOnce();
    expect(f.client.sendMessage).toHaveBeenCalledOnce();
    first.unmount(); second.unmount();
    expect(f.close).not.toHaveBeenCalled();
    await f.session.stop();
    expect(f.close).toHaveBeenCalledOnce();
  });
});
