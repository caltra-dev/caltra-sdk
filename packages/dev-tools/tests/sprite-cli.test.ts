import { describe, expect, it, vi } from "vitest";

import type { DevToolsConfig } from "../src/config.js";
import { parseSpriteCommand, runSpriteCli } from "../src/sprite-cli.js";

const config = { sprites: { tokenEnv: "SPRITES_API_TOKEN" } } as unknown as DevToolsConfig;

describe("Sprite environment CLI", () => {
  it.each([
    [["create"], { operation: "create" }],
    [["--help"], { operation: "help" }],
    [["-h"], { operation: "help" }],
  ])("parses %j", (argv, expected) => {
    expect(parseSpriteCommand(argv)).toEqual(expected);
  });

  it.each([[[]], [["up"]], [["create", "HEAD"]], [["status"]]])("rejects invalid arguments %j", (argv) => {
    expect(() => parseSpriteCommand(argv)).toThrow("Usage: npm run sprite -- create");
  });

  it("prints help without loading repository configuration", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const loadConfig = vi.fn();
    try {
      await runSpriteCli(["--help"], {}, "/missing-repository", { createBranchSprite: vi.fn(), loadConfig });
      expect(String(write.mock.calls[0]?.[0])).toContain("Create or reconcile");
      expect(loadConfig).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("creates the current branch Sprite from committed HEAD and prints one JSON result", async () => {
    const result = {
      name: "dev-preview-4be4546d-caltra-sdk-main",
      provisioningCommit: "0123456789abcdef",
      status: "warm",
      url: "https://preview.example.test",
    };
    const createBranchSprite = vi.fn().mockResolvedValue(result);
    const loadConfig = vi.fn().mockReturnValue(config);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await runSpriteCli(["create"], { SPRITES_API_TOKEN: "token" }, "/repository", {
        createBranchSprite,
        loadConfig,
      });
      expect(createBranchSprite).toHaveBeenCalledWith({
        config: config.sprites,
        cwd: "/repository",
        environment: { SPRITES_API_TOKEN: "token" },
        revision: "HEAD",
      });
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(`${JSON.stringify(result)}\n`);
    } finally {
      write.mockRestore();
    }
  });
});
