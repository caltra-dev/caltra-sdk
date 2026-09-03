#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDevToolsConfig } from "./config.js";
import {
  deletePreview,
  getPreview,
  listPreviews,
  parseOlderThan,
  prunePreviews,
  redactPreviewError,
  updatePreview,
  upPreview,
} from "./sprite-preview.js";

const usage = [
  "Usage: npm run sprite-dev -- <command> [options]",
  "",
  "Commands:",
  "  up [revision]                  Create or fully reconcile the current branch preview.",
  "  update [revision]              Hot-update committed code in an existing branch preview.",
  "  status                         Show the current branch preview and deployed commit.",
  "  list [--all]                   List repository previews, or every visible Sprite.",
  "  delete [name-or-id]            Delete one repository-managed preview explicitly.",
  "  prune --older-than <duration>  Delete inactive repository previews older than a duration.",
  "",
  "Run `npm run sprite-dev -- update --help` for update guarantees and examples.",
].join("\n");

const updateHelp = [
  "Usage: npm run sprite-dev -- update [revision]",
  "",
  "Hot-update the current branch's existing Sprite with an exact committed revision.",
  "The revision defaults to HEAD. Working-tree and untracked changes are never transferred.",
  "",
  "Update preserves the existing Sprite identity, private URL, workspace data, and managed",
  "service definitions. It checks out the revision in place, refreshes dependencies and",
  "generated artifacts, applies forward migrations when configured without reseeding or",
  "resetting data, and relies on the running development services for hot reload.",
  "",
  "Update never creates or deletes a Sprite or service. If the preview or a managed service",
  "is missing, run `npm run sprite-dev -- up [revision]` to reconcile it. Use `up` when",
  "system dependencies, service definitions, or runtime settings changed.",
  "",
  "Examples:",
  "  npm run sprite-dev -- update",
  "  npm run sprite-dev -- update HEAD",
  "  npm run sprite-dev -- update feature/committed-revision",
].join("\n");

export type DevToolsCommand =
  | { operation: "delete"; target?: string }
  | { operation: "help"; topic?: "update" }
  | { all: boolean; operation: "list" }
  | { olderThan: string; operation: "prune" }
  | { operation: "status" }
  | { operation: "update"; revision: string }
  | { operation: "up"; revision: string };

export function parseDevToolsCommand(argv: string[]): DevToolsCommand {
  if (argv.length === 0) return { operation: "up", revision: "HEAD" };
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return { operation: "help" };
  if (argv.length === 1 && argv[0] === "up") return { operation: "up", revision: "HEAD" };
  if (argv.length === 2 && argv[0] === "up" && argv[1]) return { operation: "up", revision: argv[1] };
  if (argv.length === 1 && argv[0] === "update") return { operation: "update", revision: "HEAD" };
  if (argv.length === 2 && argv[0] === "update" && argv[1] === "--help") {
    return { operation: "help", topic: "update" };
  }
  if (argv.length === 2 && argv[0] === "update" && argv[1]) return { operation: "update", revision: argv[1] };
  if (argv.length === 1 && argv[0] === "status") return { operation: "status" };
  if (argv.length === 1 && argv[0] === "list") return { all: false, operation: "list" };
  if (argv.length === 2 && argv[0] === "list" && argv[1] === "--all") return { all: true, operation: "list" };
  if (argv.length === 1 && argv[0] === "delete") return { operation: "delete" };
  if (argv.length === 2 && argv[0] === "delete" && argv[1]) return { operation: "delete", target: argv[1] };
  if (argv.length === 3 && argv[0] === "prune" && argv[1] === "--older-than" && argv[2]) {
    parseOlderThan(argv[2]);
    return { olderThan: argv[2], operation: "prune" };
  }
  throw new Error(usage);
}

export async function runDevToolsCli(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<void> {
  const command = parseDevToolsCommand(argv);
  if (command.operation === "help") {
    process.stdout.write(`${command.topic === "update" ? updateHelp : usage}\n`);
    return;
  }
  const config = loadDevToolsConfig({ cwd });
  if (command.operation === "up") {
    process.stdout.write(`${JSON.stringify(await upPreview({ config: config.sprites, cwd, environment, revision: command.revision }))}\n`);
    return;
  }
  if (command.operation === "update") {
    process.stdout.write(`${JSON.stringify(await updatePreview({ config: config.sprites, cwd, environment, revision: command.revision }))}\n`);
    return;
  }
  if (command.operation === "status") {
    process.stdout.write(`${JSON.stringify(await getPreview({ config: config.sprites, cwd, environment }))}\n`);
    return;
  }
  if (command.operation === "list") {
    process.stdout.write(`${JSON.stringify(await listPreviews({ all: command.all, config: config.sprites, environment }))}\n`);
    return;
  }
  if (command.operation === "delete") {
    process.stdout.write(`${JSON.stringify(await deletePreview({
      config: config.sprites,
      cwd,
      environment,
      ...(command.target === undefined ? {} : { target: command.target }),
    }))}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await prunePreviews({ config: config.sprites, environment, olderThan: command.olderThan }))}\n`);
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
  runDevToolsCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(redactPreviewError(error, process.env));
    process.exitCode = 1;
  });
}
