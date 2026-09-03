import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { APIError, SpritesClient, type ServiceRequest, type Sprite } from "@fly/sprites";

import type { DevToolsConfig } from "./config.js";

export type RevisionBundle = { cleanup(): void; commit: string; path: string; ref: string };
export type PreviewResult = { commit: string; name: string; url: string };
export type SpriteSummary = {
  id: string | null;
  lastActivityAt: string | null;
  name: string;
  status: string;
  url: string | null;
};
export type PreviewService = { definition: ServiceRequest; name: string };

type SpriteManagementClient = Pick<SpritesClient, "deleteSprite" | "listAllSprites">;

const gitEnvironmentNames = [
  "HOME", "LANG", "LC_ALL", "PATH", "SHELL", "SSL_CERT_DIR", "SSL_CERT_FILE", "TMP", "TMPDIR", "TEMP",
] as const;
const sdkEnvironmentNames = [
  "CALTRA_API_URL", "CALTRA_API_KEY", "CALTRA_WORKSPACE_ID", "CALTRA_TENANT_USER_EXTERNAL_ID",
] as const;

function gitEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: "0" };
  for (const name of gitEnvironmentNames) {
    const value = environment[name];
    if (value !== undefined) child[name] = value;
  }
  return child;
}

function runGit(repositoryRoot: string, args: string[], environment = process.env): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: gitEnvironment(environment),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function createRevisionBundle(input: {
  environment?: NodeJS.ProcessEnv;
  repositoryRoot: string;
  revision: string;
}): RevisionBundle {
  const environment = input.environment ?? process.env;
  const commit = runGit(input.repositoryRoot, ["rev-parse", "--verify", `${input.revision}^{commit}`], environment);
  const directory = mkdtempSync(join(tmpdir(), "sprite-dev-bundle-"));
  const path = join(directory, "source.bundle");
  const ref = `refs/sprite-dev/${randomUUID().replaceAll("-", "")}`;
  runGit(input.repositoryRoot, ["update-ref", ref, commit], environment);
  try {
    runGit(input.repositoryRoot, ["bundle", "create", path, ref], environment);
  } finally {
    runGit(input.repositoryRoot, ["update-ref", "-d", ref], environment);
  }
  return { cleanup: () => rmSync(directory, { force: true, recursive: true }), commit, path, ref };
}

export function requiredSpritesToken(environment: NodeJS.ProcessEnv, name: "SPRITES_API_TOKEN"): string {
  const token = environment[name]?.trim();
  if (!token) throw new Error(`${name} is required in .env.dev-tools.gitvaulty.`);
  return token;
}

export function requiredSdkEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of sdkEnvironmentNames) {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`${name} is required in .env.dev-tools.gitvaulty.`);
    result[name] = value;
  }
  return result;
}

export function previewName(prefix: string, source: string): string {
  const slug = source.toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, Math.max(0, 62 - prefix.length))
    .replaceAll(/-+$/gu, "");
  const suffix = slug || createHash("sha256").update(source).digest("hex").slice(0, 10);
  return `${prefix}-${suffix}`.slice(0, 63).replaceAll(/-+$/gu, "");
}

function repositoryRoot(cwd: string): string {
  return runGit(cwd, ["rev-parse", "--show-toplevel"]);
}

function repositoryBranch(root: string): string {
  try {
    return runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return runGit(root, ["rev-parse", "--short=12", "HEAD"]);
  }
}

function repositoryPrefix(config: DevToolsConfig["sprites"]): string {
  return `${config.namePrefix}-${config.repositorySlug}`;
}

function managedPrefix(config: DevToolsConfig["sprites"]): string {
  return `${repositoryPrefix(config)}-`;
}

export function remoteServiceDefinitions(
  config: DevToolsConfig["sprites"],
  environment: Record<string, string>,
  publicUrl: string,
): PreviewService[] {
  return [{
    definition: {
      args: ["--host", "0.0.0.0", "--port", String(config.application.webPort)],
      cmd: `${config.workspaceDir}/node_modules/.bin/vite`,
      dir: `${config.workspaceDir}/apps/test-app`,
      env: { ...environment, __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: new URL(publicUrl).hostname },
      httpPort: config.application.webPort,
    },
    name: "web",
  }];
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const event of stream) void event;
}

async function execChecked(
  sprite: Sprite,
  file: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): Promise<void> {
  try {
    await sprite.execFile(file, args, options);
  } catch (error) {
    const result = (error as { result?: { exitCode?: number; stderr?: unknown; stdout?: unknown } }).result;
    const detail = String(result?.stderr ?? "").trim() || String(result?.stdout ?? "").trim().slice(-4_000);
    throw new Error(detail || `Remote command failed with exit code ${result?.exitCode ?? "unknown"}.`, { cause: error });
  }
}

export async function ensureSprite(client: SpritesClient, name: string, config: DevToolsConfig["sprites"]): Promise<Sprite> {
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

export async function removeManagedServices(sprite: Sprite): Promise<void> {
  const existing = new Set((await sprite.listServices()).map((service) => service.name));
  if (existing.has("web")) await sprite.deleteService("web");
}

export async function upPreview(input: {
  config: DevToolsConfig["sprites"];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  revision: string;
}): Promise<PreviewResult> {
  const root = repositoryRoot(input.cwd);
  const name = previewName(repositoryPrefix(input.config), repositoryBranch(root));
  const token = requiredSpritesToken(input.environment, input.config.tokenEnv);
  const applicationEnvironment = requiredSdkEnvironment(input.environment);
  const bundle = createRevisionBundle({ environment: input.environment, repositoryRoot: root, revision: input.revision });
  const client = new SpritesClient(token, { controlMode: false, timeout: 60_000 });
  try {
    const sprite = await ensureSprite(client, name, input.config);
    const url = sprite.url;
    if (!url) throw new Error("Sprites did not return a preview URL.");
    const filesystem = sprite.filesystem("/");
    await removeManagedServices(sprite);
    await filesystem.writeFile(input.config.bundlePath, readFileSync(bundle.path), { mode: 0o600 });
    try {
      await execChecked(sprite, "mkdir", ["-p", input.config.workspaceDir]);
      await execChecked(sprite, "git", ["-C", input.config.workspaceDir, "init"]);
      await execChecked(sprite, "git", ["-C", input.config.workspaceDir, "fetch", "--force", input.config.bundlePath, bundle.ref]);
      await execChecked(sprite, "git", ["-C", input.config.workspaceDir, "checkout", "--detach", "--force", "FETCH_HEAD"]);
      await execChecked(sprite, "git", ["-C", input.config.workspaceDir, "clean", "-ffd"]);
    } finally {
      await filesystem.rm(input.config.bundlePath, { force: true });
    }
    await execChecked(sprite, "npm", ["install", "--ignore-scripts=false"], {
      cwd: input.config.workspaceDir,
      timeout: 900_000,
    });
    await execChecked(sprite, "npm", ["run", "build", "--workspace=@caltra/react"], {
      cwd: input.config.workspaceDir,
      timeout: 120_000,
    });
    for (const service of remoteServiceDefinitions(input.config, applicationEnvironment, url)) {
      await drain(await sprite.createService(service.name, service.definition, "2s"));
    }
    await filesystem.writeFile("/home/sprite/.sprite-dev/deployment.json", JSON.stringify({ commit: bundle.commit }), { mode: 0o600 });
    return { commit: bundle.commit, name, url };
  } finally {
    bundle.cleanup();
  }
}

export async function getPreview(input: {
  config: DevToolsConfig["sprites"];
  cwd: string;
  environment: NodeJS.ProcessEnv;
}): Promise<PreviewResult & { status: string }> {
  const root = repositoryRoot(input.cwd);
  const name = previewName(repositoryPrefix(input.config), repositoryBranch(root));
  const sprite = await new SpritesClient(requiredSpritesToken(input.environment, input.config.tokenEnv)).getSprite(name);
  if (!sprite.url) throw new Error("Sprites did not return a preview URL.");
  const metadata = JSON.parse(String(await sprite.filesystem("/").readFile(
    "/home/sprite/.sprite-dev/deployment.json", "utf8",
  ))) as { commit?: unknown };
  if (typeof metadata.commit !== "string") throw new Error("Sprite preview deployment metadata is invalid.");
  return { commit: metadata.commit, name, status: sprite.status ?? "unknown", url: sprite.url };
}

function managementClient(
  config: DevToolsConfig["sprites"],
  environment: NodeJS.ProcessEnv,
  client?: SpriteManagementClient,
): SpriteManagementClient {
  return client ?? new SpritesClient(requiredSpritesToken(environment, config.tokenEnv));
}

function isManagedSprite(sprite: Sprite, config: DevToolsConfig["sprites"]): boolean {
  return sprite.name.startsWith(managedPrefix(config));
}

function latestActivity(sprite: Sprite): Date | undefined {
  const dates = [sprite.lastWarmingAt, sprite.lastRunningAt, sprite.updatedAt, sprite.createdAt]
    .filter((value): value is Date => value instanceof Date && Number.isFinite(value.getTime()));
  return dates.length === 0 ? undefined : new Date(Math.max(...dates.map((value) => value.getTime())));
}

function summarizeSprite(sprite: Sprite): SpriteSummary {
  return {
    id: sprite.id ?? null,
    lastActivityAt: latestActivity(sprite)?.toISOString() ?? null,
    name: sprite.name,
    status: sprite.status ?? "unknown",
    url: sprite.url ?? null,
  };
}

async function repositorySprites(client: SpriteManagementClient, config: DevToolsConfig["sprites"]): Promise<Sprite[]> {
  return (await client.listAllSprites(managedPrefix(config))).filter((sprite) => isManagedSprite(sprite, config));
}

export async function listPreviews(input: {
  all: boolean;
  client?: SpriteManagementClient;
  config: DevToolsConfig["sprites"];
  environment: NodeJS.ProcessEnv;
}): Promise<{ scope: "organization" | "repository"; sprites: SpriteSummary[] }> {
  const client = managementClient(input.config, input.environment, input.client);
  const sprites = input.all ? await client.listAllSprites(undefined) : await repositorySprites(client, input.config);
  return {
    scope: input.all ? "organization" : "repository",
    sprites: sprites.map(summarizeSprite).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function deletePreview(input: {
  client?: SpriteManagementClient;
  config: DevToolsConfig["sprites"];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  target?: string;
}): Promise<{ id: string | null; name: string }> {
  const client = managementClient(input.config, input.environment, input.client);
  const target = input.target ?? previewName(
    repositoryPrefix(input.config), repositoryBranch(repositoryRoot(input.cwd)),
  );
  const sprite = (await repositorySprites(client, input.config))
    .find((candidate) => candidate.id === target || candidate.name === target);
  if (!sprite) throw new Error(`Repository-managed Sprite not found: ${target}`);
  await client.deleteSprite(sprite.name);
  return { id: sprite.id ?? null, name: sprite.name };
}

export function parseOlderThan(value: string): number {
  const units = { d: 86_400_000, h: 3_600_000, m: 60_000, w: 604_800_000 } as const;
  const match = /^(\d+)([mhdw])$/u.exec(value);
  const amount = Number(match?.[1]);
  const unit = match?.[2] as keyof typeof units | undefined;
  if (!match || !Number.isSafeInteger(amount) || amount < 1 || !unit) {
    throw new Error("--older-than must be a positive duration such as 30m, 12h, 7d, or 2w.");
  }
  const result = amount * units[unit];
  if (!Number.isSafeInteger(result)) throw new Error("--older-than duration is too large.");
  return result;
}

export async function prunePreviews(input: {
  client?: SpriteManagementClient;
  config: DevToolsConfig["sprites"];
  environment: NodeJS.ProcessEnv;
  now?: Date;
  olderThan: string;
}): Promise<{ cutoffAt: string; deleted: SpriteSummary[] }> {
  const client = managementClient(input.config, input.environment, input.client);
  const cutoff = new Date((input.now ?? new Date()).getTime() - parseOlderThan(input.olderThan));
  const candidates = (await repositorySprites(client, input.config)).filter((sprite) => {
    const activity = latestActivity(sprite);
    return sprite.status !== "running" && activity !== undefined && activity < cutoff;
  });
  for (const sprite of candidates) await client.deleteSprite(sprite.name);
  return { cutoffAt: cutoff.toISOString(), deleted: candidates.map(summarizeSprite) };
}

export function redactPreviewError(error: unknown, environment: NodeJS.ProcessEnv): string {
  let message = error instanceof Error ? error.message : "Sprite preview command failed.";
  for (const [name, value] of Object.entries(environment)) {
    if ((name.includes("TOKEN") || name.includes("SECRET") || name.includes("KEY")) && value) {
      message = message.replaceAll(value, "[REDACTED]");
    }
  }
  return message;
}
