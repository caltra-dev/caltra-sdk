// @vitest-environment jsdom
import { expect, it } from "vitest";
import * as root from "../src/index.js";
import * as ui from "../src/ui/index.js";

// The root entry is the headless runtime and must not pull in styled components (and their CSS);
// styled UI, BrowserLiveView included, ships from the "./ui" entry.
it("exports BrowserLiveView only from the styled ui entry", () => {
  expect(Object.keys(root)).not.toContain("BrowserLiveView");
  expect(Object.keys(root)).not.toContain("CaltraChat");
  expect(typeof ui.BrowserLiveView).toBe("function");
  expect(typeof ui.CaltraChat).toBe("function");
});
