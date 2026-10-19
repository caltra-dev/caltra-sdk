import { expect, test, type Page, type Route } from "@playwright/test";

const agentId = "9a1c6429-a37c-4a67-b2fb-fdc847e6424a";
const sessionId = "5da952ec-2d4b-4fb5-9cc9-24e6545c38e4";
const agentName = "Field Researcher";
const successMessage = `Session opened for ${agentName}.`;

interface ApiHarness {
  releaseCreate: () => void;
  releaseHistory: () => void;
}

async function installApiHarness(page: Page, delayedHistory = false, historyCount = 1): Promise<ApiHarness> {
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
      await json(route, { data: delayedHistory ? Array.from({ length: historyCount }, (_, index) => ({ id: `5da952ec-2d4b-4fb5-9cc9-${String(index).padStart(12, "0")}`, role: "assistant", status: "completed", text: "Saved **conversation**", created_at: "2026-10-19T12:00:00.000Z" })) : [], next_cursor: null });
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

    if (viewport.width === 1440) {
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
    await page.getByLabel("Appearance").selectOption("custom");
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
