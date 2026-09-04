import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { APIError, SpritesClient, type Sprite } from "@fly/sprites";

import type { DevToolsConfig } from "./config.js";

const provisioningRelativePath = "scripts/sprite/provision.sh";
const provisioningRemotePath = "/home/sprite/.sprite-dev/provision.sh";

// The provider appends `-xxxxx` when it turns a Sprite name into a sprites.app DNS label.
const spriteNameDnsBudget = 57;

const gitEnvironmentNames = [
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "SHELL",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TMP",
  "TMPDIR",
  "TEMP",
] as const;

type SpriteCreationClient = Pick<SpritesClient, "createSprite" | "getSprite">;

export type BranchSpriteResult = {
  name: string;
  provisioningCommit: string;
  status: string;
  url: string;
};

export type ReconciledBranchSprite = BranchSpriteResult & { sprite: Sprite };

function gitEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: "0" };
  for (const name of gitEnvironmentNames) {
    const value = environment[name];
    if (value !== undefined) child[name] = value;
  }
  return child;
}

export function runGit(repositoryRoot: string, args: string[], environment: NodeJS.ProcessEnv = process.env): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: gitEnvironment(environment),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function repositoryRoot(cwd: string): string {
  return runGit(cwd, ["rev-parse", "--show-toplevel"]);
}

export function repositoryBranch(root: string): string {
  try {
    return runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return runGit(root, ["rev-parse", "--short=12", "HEAD"]);
  }
}

export function previewName(prefix: string, source: string): string {
  const slug = source.toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, spriteNameDnsBudget - prefix.length - 1)
    .replaceAll(/-+$/gu, "");
  const suffix = slug || createHash("sha256").update(source).digest("hex").slice(0, 10);
  return `${prefix}-${suffix}`.slice(0, spriteNameDnsBudget).replaceAll(/-+$/gu, "");
}

export function repositoryPrefix(config: DevToolsConfig["sprites"]): string {
  const repositoryIdentity = createHash("sha256").update(config.repositorySlug).digest("hex").slice(0, 8);
  return `${config.namePrefix}-${repositoryIdentity}-${config.repositorySlug}`;
}

export function requiredSpritesToken(environment: NodeJS.ProcessEnv, name: "SPRITES_API_TOKEN"): string {
  const token = environment[name]?.trim();
  if (!token) throw new Error(`${name} is required in .env.dev-tools.gitvaulty.`);
  return token;
}

export function readProvisioningScript(
  root: string,
  revision: string,
  environment: NodeJS.ProcessEnv = process.env,
): { commit: string; script: string } {
  const commit = runGit(root, ["rev-parse", "--verify", `${revision}^{commit}`], environment);
  const script = execFileSync("git", ["show", `${commit}:${provisioningRelativePath}`], {
    cwd: root,
    encoding: "utf8",
    env: gitEnvironment(environment),
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { commit, script };
}

export async function execChecked(
  sprite: Sprite,
  file: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): Promise<void> {
  try {
    const result = await sprite.execFile(file, args, options);
    if (result.exitCode !== 0) {
      const stderr = String(result.stderr ?? "").trim();
      const stdout = String(result.stdout ?? "").trim();
      throw Object.assign(new Error("Remote command failed."), { result: { ...result, stderr, stdout } });
    }
  } catch (error) {
    const result = (error as { result?: { exitCode?: number; stderr?: unknown; stdout?: unknown } }).result;
    const stderr = String(result?.stderr ?? "").trim();
    const stdout = String(result?.stdout ?? "").trim();
    const detail = stderr || stdout.slice(-4_000);
    throw new Error(detail || `Remote command failed with exit code ${result?.exitCode ?? "unknown"}.`, { cause: error });
  }
}

export async function ensureSprite(
  client: SpriteCreationClient,
  name: string,
  config: DevToolsConfig["sprites"],
): Promise<Sprite> {
  try {
    const sprite = await client.getSprite(name);
    await sprite.update({ urlSettings: config.url });
    return sprite;
  } catch (error) {
    if (!(error instanceof APIError) || error.statusCode !== 404) throw error;
    return await client.createSprite(name, {
      config: config.resources,
      runtime: config.runtime,
      urlSettings: config.url,
      waitForCapacity: true,
    });
  }
}

export async function provisionSprite(sprite: Sprite, script: string): Promise<void> {
  await execChecked(sprite, "mkdir", ["-p", "/home/sprite/.sprite-dev"]);
  await sprite.filesystem("/").writeFile(provisioningRemotePath, script, { mode: 0o700 });
  await execChecked(sprite, "/bin/bash", [provisioningRemotePath], { timeout: 900_000 });
}

export async function reconcileBranchSprite(input: {
  client?: SpriteCreationClient;
  config: DevToolsConfig["sprites"];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  revision?: string;
}): Promise<ReconciledBranchSprite> {
  const root = repositoryRoot(input.cwd);
  const name = previewName(repositoryPrefix(input.config), repositoryBranch(root));
  const provisioning = readProvisioningScript(root, input.revision ?? "HEAD", input.environment);
  const client = input.client ?? new SpritesClient(
    requiredSpritesToken(input.environment, input.config.tokenEnv),
    { controlMode: false, timeout: 60_000 },
  );
  const sprite = await ensureSprite(client, name, input.config);
  if (!sprite.url) throw new Error("Sprites did not return a preview URL.");
  await provisionSprite(sprite, provisioning.script);
  return {
    name,
    provisioningCommit: provisioning.commit,
    sprite,
    status: sprite.status ?? "unknown",
    url: sprite.url,
  };
}

export async function createBranchSprite(
  input: Parameters<typeof reconcileBranchSprite>[0],
): Promise<BranchSpriteResult> {
  const result = await reconcileBranchSprite(input);
  return {
    name: result.name,
    provisioningCommit: result.provisioningCommit,
    status: result.status,
    url: result.url,
  };
}
