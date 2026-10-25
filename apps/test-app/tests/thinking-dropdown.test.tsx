// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { ModelSelector } from "@caltra/react/ui/model-selector";
import { ThinkingDropdown } from "../src/demo/thinking-dropdown.js";
import { PopoverPortalContainer } from "@caltra/react/ui/model-selector";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

it("offers all seven efforts and keeps nested menu keyboard events out of the model list", async () => {
  const changeEffort = vi.fn();
  const changeModel = vi.fn();
  const efforts = ["Provider default", "low", "medium", "high", "xhigh", "max", "ultra"]
    .map(name => ({ id: name, name }));
  render(
    <PopoverPortalContainer.Provider value={document.body}>
    <ModelSelector.Root models={[
      { id: "reasoning", name: "Reasoning model", efforts },
      { id: "other", name: "Other model" },
    ]} defaultOpen defaultEffort="Provider default" onEffortChange={changeEffort} onValueChange={changeModel}>
      <ModelSelector.Trigger />
      <ModelSelector.Content searchable={false}>
        <ModelSelector.List />
        <ThinkingDropdown />
      </ModelSelector.Content>
    </ModelSelector.Root>
    </PopoverPortalContainer.Provider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Thinking" }));
  expect(await screen.findAllByRole("menuitemradio")).toHaveLength(7);
  expect(screen.getByRole("menuitemradio", { name: "Provider default" }).getAttribute("aria-checked")).toBe("true");
  const last = screen.getByRole("menuitemradio", { name: "ultra" });
  last.focus();
  fireEvent.keyDown(last, { key: "ArrowUp" });
  expect(changeModel).not.toHaveBeenCalled();
  fireEvent.click(last);
  await waitFor(() => expect(changeEffort).toHaveBeenLastCalledWith("ultra"));
  expect(screen.getByRole("button", { name: "Thinking" }).textContent).toContain("ultra");
  expect(screen.getByRole("option", { name: "Other model" })).toBeTruthy();
  const selected = await screen.findByRole("menuitemradio", { name: "ultra" });
  expect(selected.getAttribute("aria-checked")).toBe("true");
  fireEvent.keyDown(selected, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(screen.getByRole("option", { name: "Other model" })).toBeTruthy();
  expect(changeModel).not.toHaveBeenCalled();
});
