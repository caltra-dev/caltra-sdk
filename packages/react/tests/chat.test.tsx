// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CaltraApiError } from "@caltra/client";
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
  return { client, resolve: async (text?: string) => {
    await waitFor(() => expect(releases.length).toBeGreaterThan(0));
    await act(async () => { releases.shift()!({ data: text ? [{ id: text, role: "assistant", text, status: "completed", created_at: new Date().toISOString() }] : [], next_cursor: null }); });
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
    rendered.rerender(<CaltraChat client={f.client as never} sessionId="session" hidden labels={{ welcomeTitle: "Ciao" }} style={{ "--caltra-accent": "blue" }} />);
    rendered.rerender(<CaltraChat client={f.client as never} sessionId="session" labels={{ welcomeTitle: "Ciao" }} />);
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
