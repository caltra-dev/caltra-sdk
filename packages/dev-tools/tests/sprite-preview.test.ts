import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { DevToolsConfig } from "../src/config.js";
import {
  createRevisionBundle,
  previewName,
  redactPreviewError,
  remoteServiceDefinitions,
  requiredSdkEnvironment,
  requiredSpritesToken,
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
});
