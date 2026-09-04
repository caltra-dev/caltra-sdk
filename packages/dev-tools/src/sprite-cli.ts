#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDevToolsConfig, type DevToolsConfig } from "./config.js";
import { createBranchSprite } from "./sprite-environment.js";
import { redactPreviewError } from "./sprite-preview.js";

const usage = [
  "Usage: npm run sprite -- create",
  "",
  "Commands:",
  "  create  Create or reconcile and provision the current branch's Sprite from committed HEAD.",
].join("\n");

export type SpriteCommand = { operation: "create" | "help" };

type SpriteCliDependencies = {
  createBranchSprite: typeof createBranchSprite;
  loadConfig(options: { cwd: string }): DevToolsConfig;
};

const defaultDependencies: SpriteCliDependencies = { createBranchSprite, loadConfig: loadDevToolsConfig };

export function parseSpriteCommand(argv: string[]): SpriteCommand {
  if (argv.length === 1 && argv[0] === "create") return { operation: "create" };
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return { operation: "help" };
  throw new Error(usage);
}

export async function runSpriteCli(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  dependencies: SpriteCliDependencies = defaultDependencies,
): Promise<void> {
  const command = parseSpriteCommand(argv);
  if (command.operation === "help") {
    process.stdout.write(`${usage}\n`);
    return;
  }

  const config = dependencies.loadConfig({ cwd });
  const result = await dependencies.createBranchSprite({
    config: config.sprites,
    cwd,
    environment,
    revision: "HEAD",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function currentCliPath(): string {
  return realpathSync(fileURLToPath(import.meta.url));
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(resolve(entry)) === currentCliPath();
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runSpriteCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(redactPreviewError(error, process.env));
    process.exitCode = 1;
  });
}
