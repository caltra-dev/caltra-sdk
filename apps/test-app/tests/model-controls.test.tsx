// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { CaltraSessionRuntime, type CaltraClient } from "@caltra/client";
import { CaltraChat } from "@caltra/react/ui";
import { ModelControls, ModelControlsProvider } from "../src/demo/model-controls.js";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

it("finishes initial loading on a model error and keeps the draft mounted during retry", async () => {
  let rejectChoices!: (error: Error) => void;
  let resolveChoices!: (value: { choices: [] }) => void;
  const client = {
    getSessionById: vi.fn(async () => ({ id: "session" })),
    listSessionMessages: vi.fn(async () => ({ data: [], next_cursor: null })),
    getSessionModelChoices: vi.fn(() => new Promise<{ choices: [] }>((resolve, reject) => {
      resolveChoices = resolve; rejectChoices = reject;
    })),
  };
  const runtime = new CaltraSessionRuntime(client as never, "session");
  await Promise.all([runtime.refresh(), runtime.refreshMetadata()]);
  render(<ModelControlsProvider client={client as unknown as CaltraClient} runtime={runtime} snapshot={runtime.getSnapshot()}>
    {initializing => <CaltraChat runtime={runtime} initializing={initializing} components={{ ComposerControls: ModelControls }} />}
  </ModelControlsProvider>);
  expect(screen.getByText("Loading conversation")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByText("Loading models…")).toBeNull();
  await act(async () => { rejectChoices(new Error("Unavailable")); });
  const input = screen.getByRole("textbox");
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.change(input, { target: { value: "Keep my draft" } });
  fireEvent.click(screen.getByRole("button", { name: /^Retry$/ }));
  await waitFor(() => expect(client.getSessionModelChoices).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("textbox")).toBe(input);
  expect(screen.queryByText("Loading conversation")).toBeNull();
  await act(async () => { resolveChoices({ choices: [] }); });
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep my draft");
  expect(screen.queryByRole("alert")).toBeNull();
});
