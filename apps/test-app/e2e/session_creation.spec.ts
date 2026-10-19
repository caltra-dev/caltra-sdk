import { expect, test, type Page, type Route } from "@playwright/test";

const agentId = "9a1c6429-a37c-4a67-b2fb-fdc847e6424a";
const sessionId = "5da952ec-2d4b-4fb5-9cc9-24e6545c38e4";
const agentName = "Field Researcher";
const successMessage = `Session opened for ${agentName}.`;

interface ApiHarness {
  releaseCreate: () => void;
  releaseHistory: () => void;
}

async function installApiHarness(page: Page, delayedHistory = false, historyCount = 1, keepEventsOpen = false, toolCalls: object[] = []): Promise<ApiHarness> {
  if (keepEventsOpen) {
    // A finite route.fulfill body closes SSE and intentionally triggers runtime recovery.
    // Keep this transport open so appearance tests measure only appearance changes.
    await page.addInitScript(() => {
      const fetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (!url.pathname.endsWith("/events")) return fetch(input, init);
        if (init?.signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
        const body = new ReadableStream<Uint8Array>({ start(controller) {
          controller.enqueue(new TextEncoder().encode(": connected\n\n"));
          init?.signal?.addEventListener("abort", () => controller.close(), { once: true });
        } });
        return Promise.resolve(new Response(body, { headers: { "Content-Type": "text/event-stream" } }));
      };
    });
  }
  let releaseHistory = () => undefined;
  const historyGate = delayedHistory ? new Promise<void>((resolve) => { releaseHistory = resolve; }) : Promise.resolve();
  let releaseCreate = () => undefined;
  let createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });

  await page.route("**/api/client-authorization", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        expires_at: "2099-01-01T00:00:00.000Z",
        authorization_code: "cac_browser_test",
      },
    });
  });

  await page.route("http://caltra.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "POST" && url.pathname === "/caltra/v1/auth/authenticate") {
      await json(route, {
        client_token: "browser-test-token",
        expires_at: "2099-01-01T00:00:00.000Z",
        refresh_after: "2098-01-01T00:00:00.000Z",
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/client/v1/agents/get") {
      await json(route, { id: agentId, name: agentName });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/client/v1/sessions") {
      await json(route, { data: [], next_cursor: null });
      return;
    }

    if (request.method() === "POST" && url.pathname === `/client/v1/agents/${agentId}/sessions`) {
      await createGate;
      await json(route, createdSession());
      createGate = new Promise<void>((resolve) => {
        releaseCreate = resolve;
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === `/client/v1/sessions/${sessionId}`) {
      await json(route, createdSession());
      return;
    }

    if (request.method() === "GET" && url.pathname.endsWith("/messages")) {
      await historyGate;
      await json(route, { data: delayedHistory ? Array.from({ length: historyCount }, (_, index) => ({ id: `5da952ec-2d4b-4fb5-9cc9-${String(index).padStart(12, "0")}`, role: "assistant", status: "completed", text: "Saved **conversation**", tool_calls: toolCalls, created_at: "2026-10-19T12:00:00.000Z" })) : [], next_cursor: null });
      return;
    }

    if (request.method() === "GET" && url.pathname.endsWith("/events")) {
      await route.fulfill({
        body: "",
        contentType: "text/event-stream",
        headers: { "cache-control": "no-cache" },
      });
      return;
    }

    await route.fulfill({ status: 404 });
  });

  return { releaseCreate: () => releaseCreate(), releaseHistory: () => releaseHistory() };
}

async function json(route: Route, value: unknown): Promise<void> {
  await route.fulfill({ contentType: "application/json", json: value });
}

function createdSession() {
  return {
    auto_name: false,
    title: null,
    title_source: null,
    title_updated_at: null,
    agentIdentity: null,
    agent: { id: agentId, name: agentName },
    external_id: null,
    created_at: "2026-09-01T12:01:00.000Z",
    id: sessionId,
    status: "active",
    updated_at: "2026-09-01T12:01:00.000Z",
  };
}

async function startCreate(page: Page): Promise<void> {
  const picker = page.getByLabel("Open a channel");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue(agentName);
  await page.getByRole("button", { name: "Create session" }).click();
}

test("announces exactly one session success only after authoritative completion", async ({ page }) => {
  const api = await installApiHarness(page);
  await page.goto("/");

  const status = page.locator(".success-toast-region");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).toBeEmpty();

  await startCreate(page);
  await expect(status).toBeEmpty();
  await page.getByLabel("Open a channel").focus();
  api.releaseCreate();

  await expect(status).toHaveText(successMessage);
  await expect(page.locator(".success-toast")).toHaveCount(1);
  await expect(page.locator(".session-item")).toHaveCount(1);
  await expect(page.locator(".session-item")).toContainText(agentName);
  await expect(page.getByRole("heading", { level: 1, name: agentName })).toBeVisible();
  await expect(page.getByLabel("Open a channel")).toBeFocused();
  await expect(page.locator("main, aside").getByText(successMessage)).toHaveCount(0);

  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  const dismissBox = await dismiss.boundingBox();
  expect(dismissBox?.width).toBeGreaterThanOrEqual(44);
  expect(dismissBox?.height).toBeGreaterThanOrEqual(44);
  await dismiss.click();
  await expect(status).toBeEmpty();

  await startCreate(page);
  api.releaseCreate();
  await expect(page.locator(".session-item")).toHaveCount(1);
  await expect(status).toBeEmpty();
});

test("pauses the finite timeout for hover and keyboard focus and respects reduced motion", async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await installApiHarness(page);
  await page.goto("/");
  await startCreate(page);
  api.releaseCreate();

  const toast = page.locator(".success-toast");
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCSS("animation-name", "none");

  await toast.hover();
  await page.clock.fastForward(10_000);
  await expect(toast).toBeVisible();

  await dismiss.focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(10_000);
  await expect(toast).toBeVisible();

  await page.getByLabel("Open a channel").focus();
  await page.clock.fastForward(5_000);
  await expect(toast).toHaveCount(0);
});

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`places the toast safely at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const api = await installApiHarness(page);
    await page.goto("/");
    await startCreate(page);

    api.releaseCreate();

    const toast = page.locator(".success-toast");
    const region = page.locator(".success-toast-region");
    await expect(toast).toBeVisible();
    await expect(region).toHaveCSS("pointer-events", "none");
    await expect(toast).toHaveCSS("pointer-events", "auto");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    const frameWithToast = await page.locator(".app-frame").boundingBox();
    await expect(region).toHaveCSS("position", "fixed");

    const toastBox = await toast.boundingBox();
    const occupied = await page.locator("[data-success-toast-avoid]").evaluateAll((elements) => (
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
      })
    ));
    expect(toastBox).not.toBeNull();
    for (const rect of occupied) {
      const overlaps = toastBox!.x < rect.right
        && toastBox!.x + toastBox!.width > rect.left
        && toastBox!.y < rect.bottom
        && toastBox!.y + toastBox!.height > rect.top;
      expect(overlaps).toBe(false);
    }

    if (viewport.width === 1920) {
      await expect(region).toHaveAttribute("data-placement", "header");
      await page.locator("[data-success-toast-avoid]").evaluateAll((elements) => {
        for (const element of elements) {
          (element as HTMLElement).style.width = "48%";
        }
      });
      await expect(region).toHaveAttribute("data-placement", "below");
      const headerBox = await page.locator("[data-success-toast-anchor]").boundingBox();
      const fallbackBox = await toast.boundingBox();
      expect(fallbackBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    } else {
      await expect(region).toHaveAttribute("data-placement", "below");
    }

    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(toast).toHaveCount(0);
    const frameWithoutToast = await page.locator(".app-frame").boundingBox();
    expect(frameWithoutToast).toEqual(frameWithToast);
  });
}

for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 900 }]) {
  test(`loads saved history without a welcome and preserves a themed draft at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const api = await installApiHarness(page, true);
    await page.goto("/");
    await startCreate(page);
    api.releaseCreate();
    await expect(page.locator("[data-caltra-state=loading]")).toBeVisible();
    await expect(page.locator("[data-caltra-state=empty]")).toHaveCount(0);
    api.releaseHistory();
    await expect(page.locator(".caltra-chat__markdown strong")).toHaveText("conversation");
    await expect(page.locator("[data-caltra-state=empty]")).toHaveCount(0);
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await input.fill("Keep this draft");
    await input.press("Shift+Enter");
    await page.getByLabel("Theme", { exact: true }).selectOption("brand");
    await page.getByLabel("Language", { exact: true }).selectOption("it");
    await expect(page.getByRole("textbox", { name: "Messaggio", exact: true })).toHaveValue("Keep this draft\n");
    await expect(page.locator(".caltra-chat__markdown strong")).toHaveText("conversation");
    const composer = await page.locator(".caltra-chat__composer").boundingBox();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 900 }]) {
  test(`keeps long history inside the chat viewport at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const api = await installApiHarness(page, true, 40);
    await page.goto("/");
    await startCreate(page);
    api.releaseCreate();
    api.releaseHistory();
    await expect(page.locator(".caltra-chat__message")).toHaveCount(40);
    await page.getByRole("textbox", { name: "Message", exact: true }).focus();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height + 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const scrollArea = page.locator(".caltra-chat__viewport");
    expect(await scrollArea.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeInViewport();
  });
}


for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 900 }]) {
  test(`switches palettes and modes without resetting history, draft or scroll at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: "dark" });
    const api = await installApiHarness(page, true, 40, true);
    let historyRequests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/messages")) historyRequests++; });
    await page.goto("/");
    await startCreate(page);
    api.releaseCreate();
    const chat = page.locator(".caltra-chat");
    await expect(chat).toHaveCSS("background-color", "rgb(9, 9, 11)");
    await expect(chat).toHaveCSS("color-scheme", "dark");
    api.releaseHistory();
    await expect(page.locator(".caltra-chat__message")).toHaveCount(40);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Keep this draft");
    const viewportElement = page.locator(".caltra-chat__viewport");
    await viewportElement.evaluate(el => { el.scrollTop = 120; });
    const originalScroll = await viewportElement.evaluate(el => el.scrollTop);
    // Compare with the settled initial load; appearance must add no history requests.
    const historyBeforeSwitching = historyRequests;
    expect(historyBeforeSwitching).toBeGreaterThan(0);

    await page.getByLabel("Color mode", { exact: true }).selectOption("light");
    await expect(chat).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(chat).toHaveCSS("color-scheme", "light");
    await page.emulateMedia({ colorScheme: "light" });
    await page.getByLabel("Color mode", { exact: true }).selectOption("dark");
    await expect(chat).toHaveCSS("background-color", "rgb(9, 9, 11)");
    await page.getByLabel("Color mode", { exact: true }).selectOption("system");
    await expect(chat).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(chat).toHaveCSS("background-color", "rgb(9, 9, 11)");

    await page.getByLabel("Theme", { exact: true }).selectOption("ocean");
    await expect(chat).toHaveCSS("background-color", "rgb(15, 23, 42)");
    await page.getByLabel("Theme", { exact: true }).selectOption("brand");
    await expect(chat).toHaveCSS("background-color", "rgb(28, 20, 16)");
    await page.getByLabel("Color mode", { exact: true }).selectOption("light");
    await expect(chat).toHaveCSS("background-color", "rgb(255, 250, 245)");
    await expect(page.locator(".caltra-chat__composer")).toHaveCSS("border-radius", "12px");
    await expect(page.locator(".session-rail")).toHaveCSS("background-color", "rgba(24, 24, 17, 0.96)");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Keep this draft");
    await expect(page.locator(".caltra-chat__message")).toHaveCount(40);
    expect(historyRequests).toBe(historyBeforeSwitching);
    expect(await viewportElement.evaluate(el => el.scrollTop)).toBeCloseTo(originalScroll, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expect(page.getByLabel("Color mode", { exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/theme-controls-${viewport.width}.png` });
  });
}


test("copy shows a checkmark for three seconds, resets on repeated copy, and copies text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const api = await installApiHarness(page, true, 1, true);
  await page.goto("/"); await startCreate(page); api.releaseCreate(); api.releaseHistory();
  const copy = page.locator(".caltra-chat__copy");
  await copy.click();
  await expect(copy).toHaveAttribute("aria-label", "Copied");
  await expect(copy.locator("svg rect")).toHaveCount(0);
  await expect(copy.locator("svg path")).toHaveAttribute("d", "m20 6-11 11-5-5");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Saved **conversation**");
  await page.waitForTimeout(1800);
  await expect(copy).toHaveAttribute("data-copied", "true");
  await copy.click();
  await page.waitForTimeout(1800);
  await expect(copy).toHaveAttribute("data-copied", "true");
  await expect(copy).toHaveAttribute("aria-label", "Copy", { timeout: 2500 });
  await expect(copy.locator("svg rect")).toHaveCount(1);
});


for (const width of [360, 1280]) test(`upstream tool fallback exposes arguments/results/errors without horizontal overflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const api = await installApiHarness(page, true, 1, true, [
    { id: "echo", name: "demo.echo", arguments: { text: "hello" }, status: "completed", result: { text: "hello" } },
    { id: "fail", name: "demo.fail", arguments: {}, status: "failed", result: { message: "Intentional demo failure", detail: "x".repeat(500) } },
    { id: "running", name: "records.read", arguments: { recordId: "demo" }, status: "running" },
  ]);
  await page.goto("/"); await startCreate(page); api.releaseCreate(); api.releaseHistory();
  const cards = page.locator(".aui-tool-fallback-root");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).getByRole("button")).toHaveAttribute("aria-expanded", "false");
  await expect(cards.nth(0).locator(".lucide-check")).toHaveCount(1);
  await expect(cards.nth(1).locator(".lucide-circle-x")).toHaveCount(1);
  await expect(cards.nth(2).locator(".animate-spin")).toHaveCount(1);
  await cards.nth(1).getByRole("button").focus(); await page.keyboard.press("Enter");
  await expect(cards.nth(1).getByRole("button")).toHaveAttribute("aria-expanded", "true");
  await expect(cards.nth(1).locator("pre").last()).toContainText("Intentional demo failure");
  for (const mode of ["dark", "light"]) {
    await page.getByLabel("Color mode", { exact: true }).selectOption(mode);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeInViewport();
  }
  await page.screenshot({ path: `test-results/tool-cards-${width}.png` });
});
