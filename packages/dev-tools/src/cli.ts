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
  upPreview,
} from "./sprite-preview.js";

const usage = [
  "Usage: npm run sprite-dev -- [up [revision]]",
  "       npm run sprite-dev -- status",
  "       npm run sprite-dev -- list [--all]",
  "       npm run sprite-dev -- delete [name-or-id]",
  "       npm run sprite-dev -- prune --older-than <Nm|Nh|Nd|Nw>",
].join("\n");

export type DevToolsCommand =
  | { operation: "delete"; target?: string }
  | { operation: "help" }
  | { all: boolean; operation: "list" }
  | { olderThan: string; operation: "prune" }
  | { operation: "status" }
  | { operation: "up"; revision: string };

export function parseDevToolsCommand(argv: string[]): DevToolsCommand {
  if (argv.length === 0) return { operation: "up", revision: "HEAD" };
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return { operation: "help" };
  if (argv.length === 1 && argv[0] === "up") return { operation: "up", revision: "HEAD" };
  if (argv.length === 2 && argv[0] === "up" && argv[1]) return { operation: "up", revision: argv[1] };
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
    process.stdout.write(`${usage}\n`);
    return;
  }
  const config = loadDevToolsConfig({ cwd });
  if (command.operation === "up") {
    process.stdout.write(`${JSON.stringify(await upPreview({ config: config.sprites, cwd, environment, revision: command.revision }))}\n`);
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
