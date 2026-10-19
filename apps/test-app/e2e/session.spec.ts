import { expect, test } from "@playwright/test";

const configured = Boolean(
  process.env.CALTRA_API_KEY
  && process.env.CALTRA_WORKSPACE_ID,
);

test("creates a session and renders a streamed assistant response", async ({ page }) => {
  test.skip(!configured, "Set the Caltra test-app server variables to run the real local smoke test.");

  await page.goto("/");
  const agent = page.getByLabel("Open a channel");
  await expect(agent).toBeVisible();
  await expect(agent).not.toHaveValue("Loading agent…");
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.locator("[data-caltra-state=empty]")).toBeVisible();

  const prompt = `Reply with the exact phrase SDK connected ${Date.now()}`;
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(prompt);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator(".caltra-chat__message[data-role=user]").last()).toContainText(prompt);
  await expect(page.locator(".caltra-chat__message[data-role=assistant] .caltra-chat__markdown").last()).not.toBeEmpty({ timeout: 45_000 });
});
