import { expect, test } from "@playwright/test";

const sample = "/?session=70000000-0000-4000-8000-000000000001";

test("both views share the runtime while a turn is streaming", async ({ page }) => {
  await page.goto(sample);
  await page.getByRole("button", { name: "Create session", exact: true }).click();
  await expect(page.locator(".caltra-chat__message")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Shared runtime check");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
  await page.getByLabel("Chat view", { exact: true }).selectOption("standard");
  await expect(page.getByText("Shared runtime check", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
  await page.getByLabel("Chat view", { exact: true }).selectOption("caltra");
  await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toBeVisible();
  await expect(page.locator(".caltra-chat__message")).toHaveCount(9, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
});

test("Thread keeps shared controls and explains unsupported settings", async ({ page }) => {
  await page.goto(sample);
  await page.getByLabel("Language", { exact: true }).selectOption("it");
  await page.getByLabel("Theme", { exact: true }).selectOption("ocean");
  await page.getByLabel("Color mode", { exact: true }).selectOption("dark");
  await page.getByLabel("Chat view", { exact: true }).selectOption("standard");
  await expect(page.getByLabel("Language", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
  await expect(page.getByLabel("Thinking display", { exact: true })).toBeDisabled();
  await expect(page.locator("#thread-settings-limit")).toContainText("English only");
  await expect(page.locator(".signal-thread")).toHaveCSS("background-color", "rgb(15, 23, 42)");
  await expect(page.getByRole("button", { name: "Stream thinking", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reload|Export as Markdown/ })).toHaveCount(0);
  await page.getByLabel("Chat view", { exact: true }).selectOption("caltra");
  await expect(page.getByLabel("Language", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("it");
  await expect(page.getByText("Saved message 60", { exact: false })).toBeVisible();
});
