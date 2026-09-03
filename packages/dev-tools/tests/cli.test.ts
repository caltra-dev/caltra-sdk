import { describe, expect, it, vi } from "vitest";

import { parseDevToolsCommand, runDevToolsCli } from "../src/cli.js";

describe("dev-tools CLI", () => {
  it.each([
    [[], { operation: "up", revision: "HEAD" }],
    [["up"], { operation: "up", revision: "HEAD" }],
    [["up", "feature/ref"], { operation: "up", revision: "feature/ref" }],
    [["update"], { operation: "update", revision: "HEAD" }],
    [["update", "feature/ref"], { operation: "update", revision: "feature/ref" }],
    [["update", "--help"], { operation: "help", topic: "update" }],
    [["status"], { operation: "status" }],
    [["list"], { all: false, operation: "list" }],
    [["list", "--all"], { all: true, operation: "list" }],
    [["delete"], { operation: "delete" }],
    [["delete", "sprite-id"], { operation: "delete", target: "sprite-id" }],
    [["prune", "--older-than", "7d"], { olderThan: "7d", operation: "prune" }],
    [["--help"], { operation: "help" }],
  ])("parses %j", (argv, expected) => {
    expect(parseDevToolsCommand(argv)).toEqual(expected);
  });

  it.each([
    ["remove"],
    ["down"],
    ["up", "HEAD", "extra"],
    ["update", "HEAD", "extra"],
    ["list", "unexpected"],
    ["delete", "one", "two"],
    ["prune"],
    ["prune", "7d"],
  ])(
    "rejects invalid arguments %j",
    (...argv) => expect(() => parseDevToolsCommand(argv)).toThrow("Usage: npm run sprite-dev"),
  );

  it("reports an invalid prune duration", () => {
    expect(() => parseDevToolsCommand(["prune", "--older-than", "0d"]))
      .toThrow("--older-than must be a positive duration");
  });

  it("explains update guarantees without loading repository configuration", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await runDevToolsCli(["update", "--help"], {}, "/missing-repository");
      const help = String(write.mock.calls[0]?.[0]);
      expect(help).toContain("existing Sprite");
      expect(help).toContain("Working-tree and untracked changes are never transferred");
      expect(help).toContain("without reseeding or");
      expect(help).toContain("resetting data");
      expect(help).toContain("never creates or deletes a Sprite or service");
      expect(help).toContain("hot reload");
    } finally {
      write.mockRestore();
    }
  });
});
