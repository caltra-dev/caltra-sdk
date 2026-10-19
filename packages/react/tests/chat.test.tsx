// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CaltraApiError } from "@caltra/client";
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
  it("never shows a welcome while existing history is pending, including a session switch", async () => {
    const f = fixture();
    const rendered = render(<CaltraChat client={f.client as never} sessionId="first" />);
    expect(screen.getByText("Loading conversation…")).toBeTruthy();
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
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
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
  expect(screen.getByText("demo.echo")).toBeTruthy();
  const triggers = screen.getAllByRole("button", { name: /Used tool:/ });
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
