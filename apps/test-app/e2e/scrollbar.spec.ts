import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

// Resolve the public package export, so a missing build or packaged asset fails.
const stylesheet = readFileSync(new URL(import.meta.resolve("@caltra/react/scrollbar.css")), "utf8");

async function mount(page: import("@playwright/test").Page, consumerCss = "") {
  await page.setContent(`
    <style>
      body { margin: 20px; color: #18181b; }
      .viewport { width: 240px; height: 180px; overflow: auto; }
      .content { height: 1000px; }
      ${consumerCss}
    </style>
    <section class="theme">
      <div tabindex="0" role="region" aria-label="Conversation" class="viewport caltra-scrollbar custom"><div class="content">Conversation</div></div>
      <div class="viewport caltra-chat__viewport"><div class="content">Packaged chat viewport</div></div>
    </section>
    <div class="viewport unrelated"><div class="content">Host application</div></div>
  `);
  // Load after consumer rules to verify that overrides do not depend on import order.
  await page.addStyleTag({ content: stylesheet });
}

for (const width of [390, 1280]) {
  test(`native scrolling stays keyboard accessible and scoped at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mount(page);
    const viewport = page.getByRole("region", { name: "Conversation" });
    await expect(viewport).toHaveCSS("scrollbar-width", "thin");
    await expect(viewport).toHaveCSS("scrollbar-color", "rgb(212, 212, 216) rgba(0, 0, 0, 0)");
    await expect(page.locator(".caltra-chat__viewport")).toHaveCSS("scrollbar-width", "thin");
    await expect(page.locator(".unrelated")).toHaveCSS("scrollbar-width", "auto");
    await expect(page.locator(".unrelated")).toHaveCSS("scrollbar-color", "auto");
    await viewport.focus();
    await viewport.press("PageDown");
    await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(viewport).toHaveCSS("scrollbar-color", "rgb(212, 212, 216) rgba(0, 0, 0, 0)");
  });
}

test("inherited tokens control the thumb, hover, track and width", async ({ page }) => {
  await mount(page, `.theme {
    --caltra-scrollbar-thumb: #ccddee;
    --caltra-scrollbar-thumb-hover: #aabbcc;
    --caltra-scrollbar-track: #f0f1f2;
    --caltra-scrollbar-width: auto;
  }`);
  const viewport = page.getByRole("region", { name: "Conversation" });
  await expect(viewport).toHaveCSS("scrollbar-width", "auto");
  await expect(viewport).toHaveCSS("scrollbar-color", "rgb(204, 221, 238) rgb(240, 241, 242)");
  await viewport.hover();
  await expect(viewport).toHaveCSS("scrollbar-color", "rgb(170, 187, 204) rgb(240, 241, 242)");
});

test("ordinary CSS overrides both idle and hover defaults without important", async ({ page }) => {
  await mount(page, ".custom { scrollbar-color: rgb(100, 110, 120) transparent; scrollbar-width: auto; }");
  const viewport = page.getByRole("region", { name: "Conversation" });
  await expect(viewport).toHaveCSS("scrollbar-width", "auto");
  await expect(viewport).toHaveCSS("scrollbar-color", "rgb(100, 110, 120) rgba(0, 0, 0, 0)");
  await viewport.hover();
  await expect(viewport).toHaveCSS("scrollbar-color", "rgb(100, 110, 120) rgba(0, 0, 0, 0)");
});

test("theme border supplies the default and forced colors restore system colors", async ({ page }) => {
  await mount(page, ".theme { --caltra-border: #c6cbd3; }");
  const viewport = page.getByRole("region", { name: "Conversation" });
  await expect(viewport).toHaveCSS("scrollbar-color", "rgb(198, 203, 211) rgba(0, 0, 0, 0)");
  await page.emulateMedia({ forcedColors: "active" });
  await viewport.hover();
  await expect(viewport).toHaveCSS("scrollbar-color", "auto");
});
