import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadConfigDocument, z } from "meldkit";
import { describe, expect, it } from "vitest";

const directory = fileURLToPath(new URL("../../../.github/workflows/", import.meta.url));
const workflowSchema = z.object({
  on: z.record(z.string(), z.unknown()),
  permissions: z.record(z.string(), z.string()),
  concurrency: z.object({ group: z.string(), "cancel-in-progress": z.boolean() }).optional(),
  jobs: z.record(z.string(), z.object({
    steps: z.array(z.object({
      run: z.string().optional(),
      uses: z.string().optional(),
      if: z.string().optional(),
    }).passthrough()),
  }).passthrough()),
}).passthrough();
const workflows = new Map(readdirSync(directory)
  .filter((file) => /\.ya?ml$/u.test(file))
  .map((file) => [file, workflowSchema.parse(loadConfigDocument({ path: file, cwd: directory, env: {} }))]));

describe("SDK workflow event contract", () => {
  it("allows only PR validation and explicit manual publication across every workflow", () => {
    expect([...workflows.keys()].sort()).toEqual(["publish.yml", "validate.yml"]);
    // Absence of a push subscription guarantees zero runs for every path category,
    // including tags, package/version edits and mixed pushes; job-level skips cannot.
    for (const [file, workflow] of workflows) {
      expect(Object.keys(workflow.on)).toEqual([file === "publish.yml" ? "workflow_dispatch" : "pull_request"]);
    }
  });

  it("validates every PR update with a stable status and cancels superseded runs", () => {
    const workflow = workflows.get("validate.yml");
    expect(workflow).toBeDefined();
    expect(workflow?.on.pull_request).toEqual({ types: ["opened", "synchronize", "reopened"] });
    expect(Object.keys(workflow?.jobs ?? {})).toEqual(["validate"]);
    expect(workflow?.concurrency).toEqual({
      group: "${{ github.workflow }}-${{ github.event.pull_request.number }}",
      "cancel-in-progress": true,
    });
    expect(workflow?.permissions).toEqual({ contents: "read" });
    expect(workflow?.jobs.validate).not.toHaveProperty("permissions");
    expect(workflow?.jobs.validate).not.toHaveProperty("environment");
    expect(workflow?.jobs.validate?.steps.flatMap((step) => step.run ?? [])).toEqual([
      "npm install --global npm@11.19.0", "npm ci", "npm run typecheck", "npm test", "npm run build",
    ]);
    for (const step of workflow?.jobs.validate?.steps ?? []) {
      if (step.uses) expect(step.uses).toMatch(/^actions\/(checkout|setup-node)@[a-f0-9]{40}$/u);
      expect(step.if).toBeUndefined();
    }
  });

  it("preserves explicit package selection, validation, and OIDC publication", () => {
    const workflow = workflows.get("publish.yml");
    expect(workflow?.on.workflow_dispatch).toEqual({ inputs: { package: {
      description: "Package to publish", required: true, type: "choice", options: ["server", "client", "assistant-ui", "react"],
    } } });
    expect(workflow?.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(workflow?.jobs.publish?.steps.flatMap((step) => step.run ?? [])).toEqual([
      "npm install --global npm@11.19.0", "npm ci", "npm run typecheck", "npm test", "npm run build",
      "npm publish --workspace=@caltra/server", "npm publish --workspace=@caltra/client", "npm publish --workspace=@caltra/assistant-ui", "npm publish --workspace=@caltra/react",
    ]);
    expect(workflow?.jobs.publish?.steps.filter((step) => step.run?.startsWith("npm publish"))
      .map((step) => step.if)).toEqual([
      "inputs.package == 'server'", "inputs.package == 'client'", "inputs.package == 'assistant-ui'", "inputs.package == 'react'",
    ]);
  });
});
