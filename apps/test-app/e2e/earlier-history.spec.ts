import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) test(`scrolling up loads earlier pages without moving the reader at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/?demo=runtime");
  const viewport = page.locator(".caltra-chat__viewport");
  const messages = page.locator(".caltra-chat__message");
  await expect(messages).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Load older messages", exact: true })).toHaveCount(0);
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Preserve this draft");
  await viewport.hover();
  await page.mouse.wheel(0, -10_000);
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeLessThan(120);
  const anchor = page.getByText("Saved message 42", { exact: false });
  const offset = () => anchor.evaluate(el => el.getBoundingClientRect().top - document.querySelector(".caltra-chat__viewport")!.getBoundingClientRect().top);
  const before = await offset();
  await expect(page.getByRole("status", { name: "Loading older messages…" })).toBeVisible();
  const loading = page.getByRole("status", { name: "Loading older messages…" });
  expect(await loading.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(
    await messages.first().evaluate(el => el.getBoundingClientRect().top),
  );
  // New messages arrive while the earlier page is in flight.
  await page.getByRole("button", { name: "Stream steps", exact: true }).click();
  await expect.poll(() => messages.count()).toBeGreaterThanOrEqual(40);
  await expect.poll(async () => Math.abs(await offset() - before)).toBeLessThan(3);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Preserve this draft");
  await page.getByRole("button", { name: "Stop generating", exact: true }).click();
  await viewport.hover();
  await page.mouse.wheel(0, -10_000);
  await expect(page.getByText("Saved message 1", { exact: true })).toBeAttached();
  await expect(page.getByRole("status", { name: "Loading older messages…" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("failed history waits for Retry while preserving loaded messages", async ({ page }) => {
  await page.goto("/?demo=runtime");
  const viewport = page.locator(".caltra-chat__viewport");
  await expect(page.locator(".caltra-chat__message")).toHaveCount(20);
  await page.getByRole("button", { name: "Fail next history load" }).click();
  await viewport.evaluate(el => { el.scrollTop = 0; });
  await expect(page.getByRole("alert")).toContainText("Older messages could not be loaded");
  await viewport.evaluate(el => { el.scrollTop = 50; });
  await expect(page.locator(".caltra-chat__message")).toHaveCount(20);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".caltra-chat__message")).toHaveCount(40);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("custom assistant-ui uses the adapter's native LoadEarlier primitive", async ({ page }) => {
  await page.goto("/?demo=runtime");
  await page.getByLabel("Integration", { exact: true }).selectOption("custom");
  await expect(page.getByText("Saved message 21", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Load earlier messages", exact: true }).click();
  await expect(page.getByText("Saved message 21", { exact: false })).toBeAttached();
});
