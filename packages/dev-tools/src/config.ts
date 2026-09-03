import { posix } from "node:path";

import { loadConfig, MeldkitError, z } from "meldkit";

export const devToolsConfigurationPath = "dev-tools.yaml";

const absoluteSpritePath = z.string().refine(
  (value) => posix.isAbsolute(value)
    && value.startsWith("/home/sprite/")
    && posix.normalize(value) === value
    && /^\/home\/sprite\/[A-Za-z0-9._/-]+$/u.test(value),
  { message: "Expected an absolute path below /home/sprite." },
);

const spritesSchema = z.object({
  application: z.object({ webPort: z.number().int().min(1024).max(65_535) }).strict(),
  bundlePath: absoluteSpritePath,
  lifecycle: z.object({ idle: z.literal("platform") }).strict(),
  namePrefix: z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/u),
  repositorySlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/u),
  resources: z.object({
    cpus: z.number().int().min(1).max(32),
    ramMB: z.number().int().min(512).max(131_072),
    storageGB: z.number().int().min(1).max(500),
  }).strict(),
  runtime: z.literal("dev"),
  tokenEnv: z.literal("SPRITES_API_TOKEN"),
  url: z.object({ auth: z.literal("sprite"), privateAccess: z.literal("org_users") }).strict(),
  workspaceDir: absoluteSpritePath,
}).strict().refine(
  (value) => value.bundlePath !== value.workspaceDir
    && value.bundlePath.startsWith("/home/sprite/.sprite-dev/")
    && `${value.namePrefix}-${value.repositorySlug}`.length <= 50,
  { message: "Sprite transfer paths or repository prefix are invalid." },
);

const configSchema = z.object({ sprites: spritesSchema }).strict();

export type DevToolsConfig = z.infer<typeof configSchema>;

export function loadDevToolsConfig(options: { cwd?: string; path?: string } = {}): DevToolsConfig {
  try {
    return loadConfig({
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      path: options.path ?? devToolsConfigurationPath,
      schema: configSchema,
    });
  } catch (error) {
    const unavailable = error instanceof MeldkitError
      && (error.code === "CONFIG_FILE_NOT_FOUND" || error.code === "CONFIG_READ_FAILED");
    throw new Error(
      unavailable ? `${devToolsConfigurationPath} could not be loaded.` : `${devToolsConfigurationPath} is invalid.`,
      { cause: error },
    );
  }
}
