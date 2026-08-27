import { expect, test } from "@playwright/test";

const configured = Boolean(
  process.env.CALTRA_API_KEY
  && process.env.CALTRA_WORKSPACE_ID,
);

test("creates a session and renders a streamed assistant response", async ({ page }) => {
  test.skip(!configured, "Set the Caltra test-app server variables to run the real local smoke test.");

  await page.goto("/");
  const agentSelect = page.getByLabel("Open a channel");
  await expect(agentSelect).toBeVisible();
  await expect.poll(async () => await agentSelect.locator("option").count()).toBeGreaterThan(1);
  await agentSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.locator(".connection")).toContainText("connected");

  const prompt = `Reply with the exact phrase SDK connected ${Date.now()}`;
  await page.getByPlaceholder("Transmit a message…").fill(prompt);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator(".message.user").last()).toContainText(prompt);
  await expect(page.locator(".message.assistant").last()).not.toBeEmpty({ timeout: 45_000 });
});
