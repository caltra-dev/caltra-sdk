import { expect, test } from "@playwright/test";

for (const mode of ["managed", "shared"]) {
  test(`${mode}: keeps reading position across new messages and tool steps, then resumes following`, async ({ page }) => {
    await page.goto("/?demo=runtime");
    await page.getByLabel("Integration", { exact: true }).selectOption(mode);
    const viewport = page.locator(".caltra-chat__viewport");
    const count = () => page.locator(".caltra-chat__message").count();
    await expect.poll(count).toBe(36);
    const distance = () => viewport.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);
    await expect.poll(distance).toBeLessThan(2);
    await viewport.hover(); await page.mouse.wheel(0, -700);
    await expect.poll(distance).toBeGreaterThan(500);
    // Copy controls hide during streaming, changing content height above the reader.
    // Assert the visible message stays anchored rather than requiring a fixed scrollTop.
    const anchor = await viewport.evaluate(el => {
      const top = el.getBoundingClientRect().top;
      const paragraph = [...el.querySelectorAll("p")].find(p => p.textContent?.startsWith("Saved message") && p.getBoundingClientRect().top >= top)!;
      return { text: paragraph.textContent!, offset: paragraph.getBoundingClientRect().top - top };
    });
    await page.getByRole("button", { name: "Stream steps", exact: true }).click();
    await expect.poll(count).toBeGreaterThan(39);
    const offset = await page.getByText(anchor.text, { exact: true }).evaluate(el =>
      el.getBoundingClientRect().top - document.querySelector(".caltra-chat__viewport")!.getBoundingClientRect().top);
    expect(Math.abs(offset - anchor.offset)).toBeLessThan(3);
    await page.getByRole("button", { name: "Scroll to bottom", exact: true }).click();
    await expect.poll(distance).toBeLessThan(2);
    const before = await count();
    await expect.poll(count).toBeGreaterThan(before);
    await expect.poll(distance).toBeLessThan(2);
  });
}

test("explicit upstream option restores forced run-start scrolling", async ({ page }) => {
  await page.goto("/?demo=runtime");
  const viewport = page.locator(".caltra-chat__viewport");
  await expect(page.locator(".caltra-chat__message")).toHaveCount(36);
  await page.getByLabel("Force scroll on run start (resets chat)").check();
  await expect(page.locator(".caltra-chat__message")).toHaveCount(36);
  await expect.poll(() => viewport.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
  await viewport.hover(); await page.mouse.wheel(0, -700);
  await expect.poll(() => viewport.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeGreaterThan(500);
  await page.getByRole("button", { name: "Stream steps", exact: true }).click();
  await expect(page.locator(".caltra-chat__message")).toHaveCount(37);
  await expect.poll(() => viewport.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
});

test("caller-owned runtime continues receiving events while the chat is unmounted", async ({ page }) => {
  await page.goto("/?demo=runtime");
  await page.getByLabel("Integration", { exact: true }).selectOption("shared");
  await expect(page.locator(".caltra-chat__message")).toHaveCount(36);
  await page.getByRole("button", { name: "Hide chat", exact: true }).click();
  await page.getByRole("button", { name: "Stream steps", exact: true }).click();
  await expect(page.locator(".caltra-chat")).toHaveCount(0);
  await page.getByRole("button", { name: "Show chat", exact: true }).click();
  await expect.poll(() => page.locator(".caltra-chat__message").count()).toBeGreaterThan(36);
});

test("custom assistant-ui uses the same runtime to send and render history", async ({ page }) => {
  await page.goto("/?demo=runtime");
  await page.getByLabel("Integration", { exact: true }).selectOption("custom");
  await expect(page.getByText("Saved message 36", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Custom message" }).fill("Custom adapter message");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Custom adapter message", { exact: true })).toBeVisible();
  await expect(page.getByText("Incoming step 1: reading position preserved.", { exact: true })).toBeAttached();
});
