import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadDevToolsConfig } from "../src/config.js";

const validConfiguration = `
sprites:
  tokenEnv: SPRITES_API_TOKEN
  namePrefix: local-dev-tools
  repositorySlug: caltra-sdk
  workspaceDir: /home/sprite/workspace
  bundlePath: /home/sprite/.sprite-dev/source.bundle
  runtime: dev
  resources:
    cpus: 2
    ramMB: 2048
    storageGB: 10
  url:
    auth: sprite
    privateAccess: org_users
  lifecycle:
    idle: platform
  application:
    webPort: 5173
`;

function configuration(contents = validConfiguration): string {
  const directory = mkdtempSync(join(tmpdir(), "sdk-dev-tools-"));
  writeFileSync(join(directory, "dev-tools.yaml"), contents, "utf8");
  return directory;
}

describe("dev-tools configuration", () => {
  it("loads the private web preview configuration", () => {
    expect(loadDevToolsConfig({ cwd: configuration() }).sprites).toMatchObject({
      repositorySlug: "caltra-sdk",
      url: { auth: "sprite", privateAccess: "org_users" },
      application: { webPort: 5173 },
    });
  });

  it("rejects public previews and unknown settings", () => {
    expect(() => loadDevToolsConfig({ cwd: configuration(validConfiguration.replace("auth: sprite", "auth: public")) }))
      .toThrow("dev-tools.yaml is invalid");
    expect(() => loadDevToolsConfig({ cwd: configuration(`${validConfiguration}\nunknown: true\n`) }))
      .toThrow("dev-tools.yaml is invalid");
  });
});
