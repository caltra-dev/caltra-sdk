// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CaltraApiError, CaltraSessionRuntime, type CaltraSessionMessage } from "@caltra/client";
import { createCaltraTheme } from "../src/themes/index.js";
import { CaltraChat } from "../src/ui/chat.js";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

function fixture() {
  const releases: Array<(value: unknown) => void> = [];
  const client = {
    openSessionEvents: vi.fn(async () => ({
      async *[Symbol.asyncIterator]() { await new Promise(() => undefined); },
      close: vi.fn(async () => undefined),
    })),
    listSessionMessages: vi.fn(() => new Promise((resolve) => releases.push(resolve))),
    getSessionById: vi.fn(async (id: string) => ({ id })),
    sendMessage: vi.fn(async () => ({ message_id: "sent", turn_id: "turn" })),
  };
  return { client, resolve: async (text?: string, tool_calls?: unknown[]) => {
    await waitFor(() => expect(releases.length).toBeGreaterThan(0));
    await act(async () => { releases.shift()!({ data: text ? [{ id: text, role: "assistant", text, tool_calls, status: "completed", created_at: new Date().toISOString() }] : [], next_cursor: null }); });
  } };
}

describe("CaltraChat", () => {
  it("uses the native action bar after the full response and copies only answer text", async () => {
    const f = fixture();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CaltraChat client={f.client as never} sessionId="mixed-message" />);
    await f.resolve("I will save the confirmed details.", [{ id: "save", name: "demo.save", status: "completed",
      arguments: { internal: "tool-only-input" }, result: { internal: "tool-only-result" } }]);
    const text = screen.getByText("I will save the confirmed details.");
    const copy = screen.getByRole("button", { name: "Copy", exact: true });
    fireEvent.click(screen.getByRole("button", { name: "1 tool call" }));
    const tool = screen.getByRole("button", { name: "Used tool: demo.save" });
    expect(text.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tool.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("I will save the confirmed details."));
    await waitFor(() => expect(copy.getAttribute("data-copied")).toBe("true"));
    fireEvent.click(tool);
    expect(screen.getByText(/tool-only-result/)).toBeTruthy();
    expect(tool.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps Copy disabled when a response contains only tools", async () => {
    const f = fixture();
    f.client.listSessionMessages.mockImplementation(async () => ({ data: [
      { id: "user", role: "user", text: "Please save the details.", status: "completed", created_at: "2026-10-23T00:00:00Z" },
      { id: "tool", role: "assistant", text: "", status: "completed", created_at: "2026-10-23T00:00:01Z",
        tool_calls: [{ id: "save", name: "demo.save", status: "completed", arguments: {}, result: { ok: true } }] },
    ], next_cursor: null }));
    render(<CaltraChat client={f.client as never} sessionId="without-copy" />);
    await screen.findByRole("button", { name: "1 tool call" });
    expect((screen.getByRole("button", { name: "Copy", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps transcript nodes mounted through thinking, answer streaming, and a running tool gap", async () => {
    const f = fixture();
    const history: CaltraSessionMessage[] = ["First answer", "Second answer"].flatMap(text => [
      { id: `user-${text}`, role: "user", text: `Question for ${text}`, status: "completed", created_at: "2026-10-21T00:00:00Z" },
      { id: text, role: "assistant", text, status: "completed", created_at: "2026-10-21T00:00:00Z" },
    ]);
    let messages = history;
    let running = false;
    f.client.listSessionMessages.mockImplementation(async () => ({ data: messages, next_cursor: null }));
    f.client.getSessionById.mockImplementation(async id => ({ id, is_running: running }));
    const runtime = new CaltraSessionRuntime(f.client as never, "stable-actions");
    await runtime.start();
    render(<CaltraChat runtime={runtime} reasoningDisplay="collapsed" />);
    const savedMessages = [screen.getByText("First answer"), screen.getByText("Second answer")];

    history.push({ id: "new-question", role: "user", text: "New question", status: "completed", created_at: "2026-10-21T00:01:00Z" });

    running = true;
    const active: CaltraSessionMessage = { id: "active", role: "assistant", text: "", status: "streaming",
      reasoning: { status: "streaming" }, created_at: "2026-10-21T00:01:00Z" };
    messages = [...history, active];
    await act(async () => { await runtime.refresh(); await runtime.refreshMetadata(); });
    expect(screen.getByRole("button", { name: "Stop generating" })).toBeTruthy();
    expect([screen.getByText("First answer"), screen.getByText("Second answer")]).toEqual(savedMessages);

    // Native action bars may hide during a turn; prior transcript content must not remount.
    messages = [...history, { ...active, text: "New answer", reasoning: { status: "completed" } }];
    await act(async () => runtime.refresh());
    expect([screen.getByText("First answer"), screen.getByText("Second answer")]).toEqual(savedMessages);
    messages = [...history, { ...active, text: "New answer", status: "completed", reasoning: { status: "completed" } }];
    await act(async () => runtime.refresh());
    expect([screen.getByText("First answer"), screen.getByText("Second answer")]).toEqual(savedMessages);
    running = false;
    await act(async () => runtime.refreshMetadata());
    const completedButtons = screen.getAllByRole("button", { name: "Copy", exact: true });
    expect(completedButtons).toHaveLength(1);
    expect([screen.getByText("First answer"), screen.getByText("Second answer")]).toEqual(savedMessages);
    expect(screen.queryByRole("button", { name: "Stop generating" })).toBeNull();
    await runtime.stop();
  });

  it("renders one Copy action for a response with multiple text/tool steps", async () => {
    const f = fixture();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    f.client.listSessionMessages.mockImplementation(async () => ({ data: [
      { id: "one", role: "assistant", text: "Repeated text", status: "completed", created_at: "2026-10-24T00:00:00Z",
        tool_calls: [{ id: "read", name: "demo.read", status: "completed", arguments: {}, result: { ok: true } }] },
      { id: "two", role: "assistant", text: "Repeated text", status: "completed", created_at: "2026-10-24T00:00:01Z" },
    ], next_cursor: null }));
    render(<CaltraChat client={f.client as never} sessionId="multiple-text-parts" />);
    await screen.findByRole("button", { name: "1 tool call" });
    expect(screen.getAllByText("Repeated text")).toHaveLength(2);
    const copy = screen.getByRole("button", { name: "Copy", exact: true });
    expect(screen.getAllByText("Repeated text")[1]!.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Repeated text\n\nRepeated text"));
  });

  it("renders upstream MarkdownText headings, lists, quotations and code controls", async () => {
    const f = fixture();
    const rendered = render(<CaltraChat client={f.client as never} sessionId="markdown" />);
    await f.resolve("# Title\n\n## Section\n\nParagraph.\n\n- First\n- Second\n\n1. Step\n\n> Quote\n\n```js\nconst value = 1;\n```");
    expect(screen.getByRole("heading", { level: 1, name: "Title" }).className).toContain("aui-md-h1");
    expect(screen.getByRole("heading", { level: 2, name: "Section" }).className).toContain("aui-md-h2");
    expect(rendered.container.querySelector("ul.aui-md-ul")).toBeTruthy();
    expect(rendered.container.querySelector("ol.aui-md-ol")).toBeTruthy();
    expect(rendered.container.querySelector("blockquote.aui-md-blockquote")).toBeTruthy();
    expect(rendered.container.querySelector(".aui-code-header-root")).toBeTruthy();
  });

  it("never shows a welcome while existing history is pending, including a session switch", async () => {
    const f = fixture();
    const rendered = render(<CaltraChat client={f.client as never} sessionId="first" />);
    expect(screen.getByText("Loading conversation")).toBeTruthy();
    expect(screen.queryByText("How can I help you today?")).toBeNull();
    await f.resolve("Existing history");
    expect(screen.getByText("Existing history")).toBeTruthy();
    rendered.rerender(<CaltraChat client={f.client as never} sessionId="second" />);
    expect(screen.queryByText("Existing history")).toBeNull();
    expect(screen.queryByText("How can I help you today?")).toBeNull();
    await f.resolve();
    expect(screen.getByText("How can I help you today?")).toBeTruthy();
  });

  it("preserves runtime and draft on theme, label and visibility changes", async () => {
    const f = fixture();
    const rendered = render(<CaltraChat client={f.client as never} sessionId="session" />);
    await f.resolve();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this draft" } });
    rendered.rerender(<CaltraChat client={f.client as never} sessionId="session" hidden theme="ocean" colorMode="dark" labels={{ welcomeTitle: "Ciao" }} style={{ "--caltra-accent": "blue" }} />);
    rendered.rerender(<CaltraChat client={f.client as never} sessionId="session" theme="assistant-ui" colorMode="system" labels={{ welcomeTitle: "Ciao" }} />);
    expect(screen.getByText("Ciao")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep this draft");
    expect(f.client.openSessionEvents).toHaveBeenCalledOnce();
    expect(f.client.listSessionMessages).toHaveBeenCalledOnce();
  });

  it("allows welcome customization without showing it before confirmed empty history", async () => {
    const f = fixture();
    function Welcome() { return <h2>Project assistant</h2>; }
    render(<CaltraChat client={f.client as never} sessionId="session" components={{ Welcome }} />);
    expect(screen.queryByText("Project assistant")).toBeNull();
    await f.resolve();
    expect(screen.getByText("Project assistant")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message input" })).toBeTruthy();
  });

  it("keeps failed initial history distinct from an empty conversation and supports retry", async () => {
    const f = fixture();
    f.client.listSessionMessages.mockRejectedValueOnce(new CaltraApiError({ code: "denied", detail: "Internal detail", request_id: "request", retryable: false, status: 403, title: "Forbidden", type: "about:blank" }));
    render(<CaltraChat client={f.client as never} sessionId="session" />);
    await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("How can I help you today?")).toBeNull();
    expect(screen.queryByText("Internal detail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await f.resolve("Recovered history");
    expect(screen.getByText("Recovered history")).toBeTruthy();
  });
});


it("keeps independent themes scoped to each chat and lets explicit CSS overrides win", async () => {
  const first = fixture();
  const second = fixture();
  const branded = createCaltraTheme({ name: "brand", dark: { background: "#123456" } });
  const view = render(<>
    <CaltraChat client={first.client as never} sessionId="first" theme={branded} colorMode="dark" style={{ "--caltra-background": "#abcdef" }} />
    <CaltraChat client={second.client as never} sessionId="second" colorMode="light" />
  </>);
  await first.resolve("First");
  await second.resolve("Second");
  const roots = view.container.querySelectorAll<HTMLElement>(".caltra-chat");
  expect(roots[0]!.style.getPropertyValue("--caltra-theme-dark-background")).toBe("#123456");
  expect(roots[0]!.style.getPropertyValue("--caltra-background")).toBe("#abcdef");
  expect(roots[1]!.style.getPropertyValue("--caltra-theme-dark-background")).toBe("#09090b");
  expect(roots[1]!.style.getPropertyValue("--caltra-background")).toBe("");
  expect(roots[0]!.getAttribute("data-color-mode")).toBe("dark");
  expect(roots[1]!.getAttribute("data-color-mode")).toBe("light");
  expect(document.documentElement.getAttribute("style")).toBeNull();
});


it("renders inspectable tool progress, results and failures without executing from the UI", async () => {
  const f = fixture();
  render(<CaltraChat client={f.client as never} sessionId="tools" />);
  await f.resolve("Tool results", [
    { id: "one", name: "demo.echo", arguments: { text: "hello" }, status: "completed", result: { text: "hello" } },
    { id: "two", name: "demo.fail", arguments: {}, status: "failed", result: { message: "Intentional failure" } },
    { id: "three", name: "records.read", arguments: {}, status: "running" },
    { id: "four", name: "cancelled.read", arguments: {}, status: "cancelled" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "4 tool calls" }));
  expect(screen.getByText("demo.echo")).toBeTruthy();
  const triggers = screen.getAllByRole("button", { name: /(Used|Failed|Running) tool:/ });
  expect(triggers).toHaveLength(3);
  expect(triggers[0]!.getAttribute("aria-expanded")).toBe("false");
  expect(triggers[0]!.querySelector(".lucide-check")).toBeTruthy();
  expect(triggers[1]!.querySelector(".lucide-circle-x")).toBeTruthy();
  expect(triggers[2]!.querySelector(".animate-spin")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancelled tool: cancelled.read" })).toBeTruthy();
  fireEvent.click(screen.getByText("demo.fail"));
  expect(screen.getByText(/Intentional failure/)).toBeTruthy();
  expect(f.client.sendMessage).not.toHaveBeenCalled();
});

it.each(["Enter", "click"])("sends from repaired completed history using %s", async (method) => {
  const f = fixture();
  render(<CaltraChat client={f.client as never} sessionId="repaired" />);
  await f.resolve("Completed saved answer");
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Next question" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(f.client.sendMessage).not.toHaveBeenCalled();
  if (method === "Enter") fireEvent.keyDown(input, { key: "Enter" });
  else fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(f.client.sendMessage).toHaveBeenCalledWith("repaired", { text: "Next question" }));
});

it("swaps native Send for Stop and preserves running UI on failure until a successful retry", async () => {
  const message = { id: "partial", role: "assistant", text: "Partial answer", status: "streaming", created_at: new Date().toISOString() };
  const f = fixture();
  f.client.listSessionMessages.mockResolvedValue({ data: [message] });
  const cancelSession = vi.fn().mockRejectedValueOnce(new Error("Cancelled request failed")).mockImplementation(async () => {
    f.client.listSessionMessages.mockResolvedValue({ data: [{ ...message, status: "cancelled" }] });
    return { turn_id: "turn" };
  });
  render(<CaltraChat client={{ ...f.client, cancelSession } as never} sessionId="running" />);
  const stop = await screen.findByRole("button", { name: "Stop generating" });
  expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  fireEvent.click(stop);
  await screen.findByRole("alert");
  expect(await screen.findByText("Partial answer")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Stop generating" })).toBeTruthy();
  fireEvent.click(stop);
  await screen.findByRole("button", { name: "Send message" });
  expect(cancelSession).toHaveBeenCalledTimes(2);
  expect(cancelSession).toHaveBeenLastCalledWith("running");
  expect(screen.queryByRole("button", { name: "Stop generating" })).toBeNull();
});

it("observes a caller-owned runtime without opening or closing its transport", async () => {
  const { CaltraSessionRuntime } = await import("@caltra/client");
  const f = fixture();
  const runtime = new CaltraSessionRuntime(f.client as never, "shared");
  const view = render(<CaltraChat runtime={runtime} slotProps={{ composerInput: { autoFocus: false, placeholder: "Custom input" }, viewport: { className: "custom-viewport" } }} />);
  expect(f.client.openSessionEvents).not.toHaveBeenCalled();
  const started = runtime.start();
  await f.resolve("Shared history");
  await started;
  expect(screen.getByPlaceholderText("Custom input")).toBeTruthy();
  expect(view.container.querySelector('[data-slot="aui_thread-viewport"].custom-viewport')).toBeTruthy();
  const connection = await f.client.openSessionEvents.mock.results[0]!.value;
  view.unmount();
  expect(connection.close).not.toHaveBeenCalled();
  await runtime.stop();
  expect(connection.close).toHaveBeenCalledOnce();
});

it("isolates transcript and draft when switching supplied runtime identities", async () => {
  const { CaltraSessionRuntime } = await import("@caltra/client");
  const a = fixture(); const b = fixture();
  const first = new CaltraSessionRuntime(a.client as never, "first");
  const second = new CaltraSessionRuntime(b.client as never, "second");
  const view = render(<CaltraChat runtime={first} />);
  const startFirst = first.start(); await a.resolve("First identity"); await startFirst;
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Private draft" } });
  view.rerender(<CaltraChat runtime={second} />);
  expect(screen.queryByText("First identity")).toBeNull();
  const startSecond = second.start(); await b.resolve("Second identity"); await startSecond;
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  expect((await a.client.openSessionEvents.mock.results[0]!.value).close).not.toHaveBeenCalled();
  view.unmount(); await first.stop(); await second.stop();
});

it("forwards explicit composer options while keeping the native composer and extra controls", async () => {
  const f = fixture();
  function Controls() { return <button type="button">Caller controls</button>; }
  const onKeyDown = vi.fn();
  const view = render(<CaltraChat client={f.client as never} sessionId="options" submitMode="ctrlEnter"
    labels={{ placeholder: "Ask here", send: "Submit question", messageInput: "Question" }}
    components={{ ComposerControls: Controls }} slotProps={{ composerInput: { onKeyDown } }} />);
  await f.resolve();
  const input = screen.getByRole("textbox", { name: "Question" });
  expect(screen.getByPlaceholderText("Ask here")).toBe(input);
  expect(screen.getByRole("button", { name: "Caller controls" }).closest("form")).toBe(input.closest("form"));
  fireEvent.change(input, { target: { value: "Forwarded options" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(f.client.sendMessage).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  await waitFor(() => expect(f.client.sendMessage).toHaveBeenCalledWith("options", { text: "Forwarded options" }));
  expect(onKeyDown).toHaveBeenCalledTimes(2);
  view.unmount();
});

it("changes native locale without remounting the composer or grouped tool controls", async () => {
  const f = fixture();
  const view = render(<CaltraChat client={f.client as never} sessionId="locale" />);
  await f.resolve("Saved response", [{ id: "read", name: "demo.read", status: "completed", arguments: {}, result: "value" }]);
  const input = screen.getByRole("textbox");
  const group = screen.getByRole("button", { name: "1 tool call" });
  fireEvent.change(input, { target: { value: "Keep this draft" } });
  view.rerender(<CaltraChat client={f.client as never} sessionId="locale" locale="it" />);
  expect(screen.getByRole("textbox")).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe("Keep this draft");
  expect(screen.getByRole("button", { name: "1 chiamata a uno strumento" })).toBe(group);
  fireEvent.click(group);
  expect(screen.getByRole("button", { name: "Strumento usato: demo.read" })).toBeTruthy();
  expect(f.client.openSessionEvents).toHaveBeenCalledOnce();
});

it("does not rerender unchanged composer controls for answer text updates", async () => {
  const f = fixture();
  let text = "First chunk";
  f.client.listSessionMessages.mockImplementation(async () => ({ data: [{ id: "stream", role: "assistant", text,
    status: "completed", created_at: "2026-10-24T00:00:00Z" }], next_cursor: null }));
  f.client.getSessionById.mockImplementation(async id => ({ id, is_running: true }));
  const runtime = new CaltraSessionRuntime(f.client as never, "render-count");
  await runtime.start();
  const Controls = vi.fn(() => <button type="button">Stable controls</button>);
  const view = render(<CaltraChat runtime={runtime} components={{ ComposerControls: Controls }} />);
  const initialRenderCount = Controls.mock.calls.length;
  text = "First chunk and second chunk";
  await act(async () => runtime.refresh());
  await screen.findByText(text);
  expect(Controls.mock.calls.length).toBe(initialRenderCount);
  view.unmount();
  await runtime.stop();
});
