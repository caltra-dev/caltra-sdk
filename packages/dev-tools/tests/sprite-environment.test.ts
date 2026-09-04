import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { APIError, type Sprite, type SpritesClient } from "@fly/sprites";
import { describe, expect, it, vi } from "vitest";

import type { DevToolsConfig } from "../src/config.js";
import {
  createBranchSprite,
  ensureSprite,
  provisionSprite,
  readProvisioningScript,
} from "../src/sprite-environment.js";

const config: DevToolsConfig["sprites"] = {
  application: { webPort: 5173 },
  bundlePath: "/home/sprite/.sprite-dev/source.bundle",
  lifecycle: { idle: "platform" },
  namePrefix: "dev-preview",
  repositorySlug: "caltra-sdk",
  resources: { cpus: 2, ramMB: 2048, storageGB: 10 },
  runtime: "dev",
  tokenEnv: "SPRITES_API_TOKEN",
  url: { auth: "sprite", privateAccess: "org_users" },
  workspaceDir: "/home/sprite/workspace",
};

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function provisioningRepository(): { commit: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "sprite-environment-"));
  runGit(root, ["init", "--initial-branch=main"]);
  runGit(root, ["config", "user.email", "developer@example.test"]);
  runGit(root, ["config", "user.name", "Developer"]);
  mkdirSync(join(root, "scripts/sprite"), { recursive: true });
  writeFileSync(join(root, "scripts/sprite/provision.sh"), "#!/bin/bash\necho committed\n", "utf8");
  runGit(root, ["add", "scripts/sprite/provision.sh"]);
  runGit(root, ["commit", "-m", "add provisioning"]);
  return { commit: runGit(root, ["rev-parse", "HEAD"]), root };
}

describe("branch Sprite environment", () => {
  it("reads provisioning from the exact commit instead of the working tree", () => {
    const repository = provisioningRepository();
    writeFileSync(join(repository.root, "scripts/sprite/provision.sh"), "#!/bin/bash\necho dirty\n", "utf8");
    expect(readProvisioningScript(repository.root, "HEAD")).toEqual({
      commit: repository.commit,
      script: "#!/bin/bash\necho committed\n",
    });
  });

  it("reuses an existing Sprite and restores its private policy", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { update } as unknown as Sprite;
    const client = { createSprite: vi.fn(), getSprite: vi.fn().mockResolvedValue(existing) } as unknown as SpritesClient;
    await expect(ensureSprite(client, "dev-preview-branch", config)).resolves.toBe(existing);
    expect(update).toHaveBeenCalledWith({ urlSettings: config.url });
    expect(client.createSprite).not.toHaveBeenCalled();
  });

  it("creates a missing Sprite with the configured isolation boundary", async () => {
    const created = {} as Sprite;
    const client = {
      createSprite: vi.fn().mockResolvedValue(created),
      getSprite: vi.fn().mockRejectedValue(new APIError("missing", { statusCode: 404 })),
    } as unknown as SpritesClient;
    await expect(ensureSprite(client, "dev-preview-branch", config)).resolves.toBe(created);
    expect(client.createSprite).toHaveBeenCalledWith("dev-preview-branch", {
      config: config.resources,
      runtime: "dev",
      urlSettings: config.url,
      waitForCapacity: true,
    });
  });

  it("uploads and executes the provisioning script idempotently", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const execFile = vi.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: "" });
    const sprite = { execFile, filesystem: vi.fn().mockReturnValue({ writeFile }) } as unknown as Sprite;
    await provisionSprite(sprite, "#!/bin/bash\necho provision\n");
    expect(writeFile).toHaveBeenCalledWith(
      "/home/sprite/.sprite-dev/provision.sh",
      "#!/bin/bash\necho provision\n",
      { mode: 0o700 },
    );
    expect(execFile).toHaveBeenCalledWith("/bin/bash", ["/home/sprite/.sprite-dev/provision.sh"], { timeout: 900_000 });
  });

  it("returns bounded remote detail when provisioning fails", async () => {
    const sprite = {
      execFile: vi.fn()
        .mockResolvedValueOnce({ exitCode: 0, stderr: "", stdout: "" })
        .mockResolvedValueOnce({ exitCode: 23, stderr: "package install failed", stdout: "" }),
      filesystem: vi.fn().mockReturnValue({ writeFile: vi.fn().mockResolvedValue(undefined) }),
    } as unknown as Sprite;
    await expect(provisionSprite(sprite, "#!/bin/bash\nexit 23\n")).rejects.toThrow("package install failed");
  });

  it("creates and provisions the current branch Sprite from committed HEAD", async () => {
    const repository = provisioningRepository();
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const sprite = {
      execFile: vi.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: "" }),
      filesystem: vi.fn().mockReturnValue({ writeFile }),
      status: "warm",
      update: vi.fn().mockResolvedValue(undefined),
      url: "https://preview.example.test",
    } as unknown as Sprite;
    const client = { createSprite: vi.fn(), getSprite: vi.fn().mockResolvedValue(sprite) } as unknown as SpritesClient;
    await expect(createBranchSprite({
      client,
      config,
      cwd: repository.root,
      environment: {},
      revision: "HEAD",
    })).resolves.toEqual({
      name: "dev-preview-caltra-sdk-main",
      provisioningCommit: repository.commit,
      status: "warm",
      url: "https://preview.example.test",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/home/sprite/.sprite-dev/provision.sh",
      "#!/bin/bash\necho committed\n",
      { mode: 0o700 },
    );
  });
});
