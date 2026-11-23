// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CaltraApiError } from "@caltra/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserLiveView } from "../src/ui/browser_live_view.js";

const id = "30000000-0000-4000-8000-000000000001";
const problem = (status: number, code: string) => new CaltraApiError({ type: "x", title: "t", status, code, detail: "d", request_id: "r", retryable: false });

function fakeClient(overrides: Record<string, unknown> = {}) {
  const browserProfiles = {
    liveView: vi.fn().mockResolvedValue({ url: "https://view.example/ro", mode: "read_only", sessionId: "s" }),
    takeControl: vi.fn().mockResolvedValue({ url: "https://view.example/rw", mode: "interactive", expiresAt: "2026-11-22T00:00:45Z" }),
    heartbeat: vi.fn().mockResolvedValue({ expiresAt: "2026-11-22T00:01:00Z" }),
    releaseControl: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { client: { browserProfiles } as never, browserProfiles };
}

const iframe = () => document.querySelector("iframe")!;
const settle = () => act(async () => { await Promise.resolve(); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("shows the read-only iframe with a sandbox, and swaps to the interactive URL and back", async () => {
  const { client, browserProfiles } = fakeClient();
  render(<BrowserLiveView client={client} browserProfileId={id} />);
  await settle();
  expect(browserProfiles.liveView).toHaveBeenCalledWith(id);
  expect(iframe().getAttribute("src")).toBe("https://view.example/ro");
  expect(iframe().getAttribute("sandbox")).toBe("allow-same-origin allow-scripts");

  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await settle();
  expect(iframe().getAttribute("src")).toBe("https://view.example/rw");

  fireEvent.click(screen.getByRole("button", { name: "Hand back" }));
  await settle();
  // Hand back releases first, then reloads the read-only URL so the interactive connection is torn down.
  expect(browserProfiles.releaseControl).toHaveBeenCalledWith(id);
  expect(browserProfiles.liveView).toHaveBeenCalledTimes(2);
  expect(iframe().getAttribute("src")).toBe("https://view.example/ro");
  expect(browserProfiles.releaseControl.mock.invocationCallOrder[0]).toBeLessThan(browserProfiles.liveView.mock.invocationCallOrder[1]!);
});

it("offers a refresh in the empty state when no browser session is active", async () => {
  const liveView = vi.fn().mockRejectedValueOnce(problem(409, "no_active_session"))
    .mockResolvedValue({ url: "https://view.example/ro", mode: "read_only", sessionId: "s" });
  const { client } = fakeClient({ liveView });
  render(<BrowserLiveView client={client} browserProfileId={id} />);
  await settle();
  expect(iframe()).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("No browser session");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await settle();
  expect(iframe().getAttribute("src")).toBe("https://view.example/ro");
});

it("heartbeats every 20 seconds only while interactive", async () => {
  const { client, browserProfiles } = fakeClient();
  render(<BrowserLiveView client={client} browserProfileId={id} />);
  await settle();
  await act(async () => { vi.advanceTimersByTime(60_000); });
  expect(browserProfiles.heartbeat).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await settle();
  await act(async () => { vi.advanceTimersByTime(19_999); });
  expect(browserProfiles.heartbeat).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1); });
  expect(browserProfiles.heartbeat).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(20_000); });
  expect(browserProfiles.heartbeat).toHaveBeenCalledTimes(2);
});

it("falls back to read-only and stops heartbeating when control is lost", async () => {
  const heartbeat = vi.fn().mockRejectedValue(problem(409, "not_controller"));
  const { client, browserProfiles } = fakeClient({ heartbeat });
  render(<BrowserLiveView client={client} browserProfileId={id} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await settle();
  await act(async () => { vi.advanceTimersByTime(20_000); });
  await settle();
  expect(iframe().getAttribute("src")).toBe("https://view.example/ro");
  expect(screen.getByRole("alert").textContent).toContain("lost");
  await act(async () => { vi.advanceTimersByTime(60_000); });
  expect(heartbeat).toHaveBeenCalledTimes(1);
  // The lease is already gone, so unmounting must not send a release.
  cleanup();
  expect(browserProfiles.releaseControl).not.toHaveBeenCalled();
});

it("releases control with keepalive on unmount and on pagehide, but only while held", async () => {
  const first = fakeClient();
  const view = render(<BrowserLiveView client={first.client} browserProfileId={id} />);
  await settle();
  view.unmount();
  expect(first.browserProfiles.releaseControl).not.toHaveBeenCalled();

  const second = fakeClient();
  const held = render(<BrowserLiveView client={second.client} browserProfileId={id} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await settle();
  window.dispatchEvent(new Event("pagehide"));
  expect(second.browserProfiles.releaseControl).toHaveBeenCalledWith(id, { keepalive: true });
  held.unmount();
  expect(second.browserProfiles.releaseControl).toHaveBeenCalledTimes(1);

  const third = fakeClient();
  const again = render(<BrowserLiveView client={third.client} browserProfileId={id} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await settle();
  again.unmount();
  expect(third.browserProfiles.releaseControl).toHaveBeenCalledWith(id, { keepalive: true });
});

it("stays read-only and reports when take over is refused", async () => {
  const { client } = fakeClient({ takeControl: vi.fn().mockRejectedValue(problem(409, "controlled_by_other_user")) });
  render(<BrowserLiveView client={client} browserProfileId={id} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await settle();
  expect(iframe().getAttribute("src")).toBe("https://view.example/ro");
  expect(screen.getByRole("alert").textContent).toContain("take over");
});

const idB = "30000000-0000-4000-8000-000000000002";

it("discards a late liveView result for the previous profile and heartbeats only the current one", async () => {
  let resolveA!: (value: unknown) => void;
  const liveView = vi.fn((profile: string) => profile === id
    ? new Promise((resolve) => { resolveA = resolve; })
    : Promise.resolve({ url: "https://view.example/b", mode: "read_only", sessionId: "s" }));
  const { client, browserProfiles } = fakeClient({ liveView });
  const view = render(<BrowserLiveView client={client} browserProfileId={id} />);
  view.rerender(<BrowserLiveView client={client} browserProfileId={idB} />);
  await settle();
  await act(async () => resolveA({ url: "https://view.example/a", mode: "read_only", sessionId: "s" }));
  expect(iframe().getAttribute("src")).toBe("https://view.example/b");
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await settle();
  await act(async () => { vi.advanceTimersByTime(20_000); });
  expect(browserProfiles.heartbeat.mock.calls).toEqual([[idB]]);
});

it("releases a late takeControl for the previous profile against that profile and resets the view", async () => {
  let resolveTake!: (value: unknown) => void;
  const takeControl = vi.fn(() => new Promise((resolve) => { resolveTake = resolve; }));
  const { client, browserProfiles } = fakeClient({ takeControl });
  const view = render(<BrowserLiveView client={client} browserProfileId={id} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  view.rerender(<BrowserLiveView client={client} browserProfileId={idB} />);
  await settle();
  expect(screen.getByRole("button", { name: "Take over" })).toBeTruthy();
  await act(async () => resolveTake({ url: "https://view.example/rw-a", mode: "interactive", expiresAt: "x" }));
  expect(browserProfiles.releaseControl.mock.calls).toEqual([[id, { keepalive: true }]]);
  expect(iframe().getAttribute("src")).toBe("https://view.example/ro");
  view.unmount();
  expect(browserProfiles.releaseControl).toHaveBeenCalledTimes(1);
});

it("releases the held lease against the previous profile when the id changes", async () => {
  const { client, browserProfiles } = fakeClient();
  const view = render(<BrowserLiveView client={client} browserProfileId={id} />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await settle();
  view.rerender(<BrowserLiveView client={client} browserProfileId={idB} />);
  await settle();
  expect(browserProfiles.releaseControl.mock.calls).toEqual([[id, { keepalive: true }]]);
  expect(iframe().getAttribute("src")).toBe("https://view.example/ro");
  await act(async () => { vi.advanceTimersByTime(60_000); });
  expect(browserProfiles.heartbeat).not.toHaveBeenCalled();
});
