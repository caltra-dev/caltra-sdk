import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { APIError, type Sprite, type SpritesClient } from "@fly/sprites";
import { describe, expect, it, vi } from "vitest";

import type { DevToolsConfig } from "../src/config.js";
import { previewName, requiredSpritesToken } from "../src/sprite-environment.js";
import {
  createRevisionBundle,
  redactPreviewError,
  remoteServiceDefinitions,
  requiredSdkEnvironment,
  updatePreview,
} from "../src/sprite-preview.js";

const config: DevToolsConfig["sprites"] = {
  application: { webPort: 5173 },
  bundlePath: "/home/sprite/.sprite-dev/source.bundle",
  lifecycle: { idle: "platform" },
  namePrefix: "local-dev-tools",
  repositorySlug: "caltra-sdk",
  resources: { cpus: 2, ramMB: 2048, storageGB: 10 },
  runtime: "dev",
  tokenEnv: "SPRITES_API_TOKEN",
  url: { auth: "sprite", privateAccess: "org_users" },
  workspaceDir: "/home/sprite/workspace",
};

describe("Sprite SDK preview", () => {
  it("bundles only the selected commit", () => {
    const repository = mkdtempSync(join(tmpdir(), "sdk-preview-repository-"));
    const git = (args: string[]) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
    git(["init", "--initial-branch=main"]);
    git(["config", "user.email", "developer@example.test"]);
    git(["config", "user.name", "Developer"]);
    writeFileSync(join(repository, "tracked.txt"), "committed\n", "utf8");
    git(["add", "tracked.txt"]);
    git(["commit", "-m", "initial"]);
    writeFileSync(join(repository, "tracked.txt"), "dirty\n", "utf8");
    const bundle = createRevisionBundle({ repositoryRoot: repository, revision: "HEAD" });
    const checkout = mkdtempSync(join(tmpdir(), "sdk-preview-checkout-"));
    execFileSync("git", ["init"], { cwd: checkout });
    execFileSync("git", ["fetch", bundle.path, bundle.ref], { cwd: checkout });
    execFileSync("git", ["checkout", "--detach", "FETCH_HEAD"], { cwd: checkout });
    expect(readFileSync(join(checkout, "tracked.txt"), "utf8")).toBe("committed\n");
    bundle.cleanup();
  });

  it("isolates names by repository and forwards only required application settings", () => {
    expect(previewName("local-dev-tools-caltra-sdk", "Feature/Test app"))
      .toBe("local-dev-tools-caltra-sdk-feature-test-app");
    const environment = requiredSdkEnvironment({
      CALTRA_API_KEY: "key",
      CALTRA_API_URL: "https://api.example.test",
      CALTRA_TENANT_USER_EXTERNAL_ID: "test-user",
      CALTRA_WORKSPACE_ID: "workspace",
    });
    const service = remoteServiceDefinitions(config, environment, "https://preview.example.test")[0];
    expect(service?.definition.httpPort).toBe(5173);
    expect(service?.definition.env).toMatchObject({ CALTRA_API_KEY: "key" });
  });

  it("requires and redacts credentials", () => {
    expect(requiredSpritesToken({ SPRITES_API_TOKEN: " token " }, "SPRITES_API_TOKEN")).toBe("token");
    expect(() => requiredSdkEnvironment({})).toThrow("CALTRA_API_URL");
    expect(redactPreviewError(new Error("failed key-value"), { CALTRA_API_KEY: "key-value" }))
      .toBe("failed [REDACTED]");
  });

  it("hot-updates the committed SDK without recreating the Vite service", async () => {
    const repository = mkdtempSync(join(tmpdir(), "sdk-preview-update-"));
    const git = (args: string[]) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
    git(["init", "--initial-branch=main"]);
    git(["config", "user.email", "developer@example.test"]);
    git(["config", "user.name", "Developer"]);
    writeFileSync(join(repository, "tracked.txt"), "committed\n", "utf8");
    git(["add", "tracked.txt"]);
    git(["commit", "-m", "initial"]);
    const commit = git(["rev-parse", "HEAD"]);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const execFile = vi.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: "" });
    const sprite = {
      createService: vi.fn(),
      deleteService: vi.fn(),
      execFile,
      filesystem: vi.fn().mockReturnValue({ rm: vi.fn().mockResolvedValue(undefined), writeFile }),
      listServices: vi.fn().mockResolvedValue([{ name: "web" }]),
      url: "https://preview.example.test",
    } as unknown as Sprite;
    const client = { getSprite: vi.fn().mockResolvedValue(sprite) } as unknown as SpritesClient;

    await expect(updatePreview({ client, config, cwd: repository, environment: {}, revision: "HEAD" }))
      .resolves.toEqual({ commit, name: "local-dev-tools-caltra-sdk-main", url: "https://preview.example.test" });

    expect(sprite.createService).not.toHaveBeenCalled();
    expect(sprite.deleteService).not.toHaveBeenCalled();
    expect(execFile.mock.calls).toContainEqual([
      "npm",
      ["run", "build", "--workspace=@caltra/react"],
      expect.objectContaining({ cwd: config.workspaceDir }),
    ]);
    expect(writeFile).toHaveBeenCalledWith(
      "/home/sprite/.sprite-dev/deployment.json",
      JSON.stringify({ commit }),
      { mode: 0o600 },
    );
  });

  it("rejects update when the branch Sprite does not exist", async () => {
    const repository = mkdtempSync(join(tmpdir(), "sdk-preview-missing-update-"));
    const git = (args: string[]) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
    git(["init", "--initial-branch=main"]);
    git(["config", "user.email", "developer@example.test"]);
    git(["config", "user.name", "Developer"]);
    writeFileSync(join(repository, "tracked.txt"), "committed\n", "utf8");
    git(["add", "tracked.txt"]);
    git(["commit", "-m", "initial"]);
    const client = {
      getSprite: vi.fn().mockRejectedValue(new APIError("missing", { statusCode: 404 })),
    } as unknown as SpritesClient;

    await expect(updatePreview({ client, config, cwd: repository, environment: {}, revision: "HEAD" }))
      .rejects.toThrow("run `npm run sprite-dev -- up`");
  });
});
