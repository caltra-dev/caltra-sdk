import { describe, expect, it } from "vitest";

import { parseDevToolsCommand } from "../src/cli.js";

describe("dev-tools CLI", () => {
  it.each([
    [[], { operation: "up", revision: "HEAD" }],
    [["up"], { operation: "up", revision: "HEAD" }],
    [["up", "feature/ref"], { operation: "up", revision: "feature/ref" }],
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
});
