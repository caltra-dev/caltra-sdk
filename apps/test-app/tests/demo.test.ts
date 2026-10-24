import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { CaltraClient } from "@caltra/client";
import { LocalStub } from "../server/local_stub.js";
import { demoReasoningModelId, demoFastModelId } from "../src/demo/client.js";
import { DemoConfig } from "../../../scripts/demo/config.ts";

let server: ViteDevServer | undefined;
afterEach(async () => { await server?.close(); });

describe("Demo launcher", () => {
  it("defaults to stub and lets explicit stub override and remove inherited secrets", () => {
    expect(new DemoConfig([], {}).environment.CALTRA_DEMO_MODE).toBe("stub");
    const config = new DemoConfig(["--local-stub"], { CALTRA_API_KEY: "secret", npm_config_api_key: "old-secret" });
    expect(config.environment.CALTRA_DEMO_MODE).toBe("stub");
    expect(JSON.stringify(config.environment)).not.toContain("secret");
  });
  it("supports environment and CLI overrides", () => {
    expect(new DemoConfig([], { CALTRA_API_KEY: "env-key" }).environment.CALTRA_API_KEY).toBe("env-key");
    expect(new DemoConfig(["--caltra-api-key", "flag-key"], { CALTRA_API_KEY: "env-key" }).environment.CALTRA_API_KEY).toBe("flag-key");
    expect(() => new DemoConfig(["--caltra-api-key"], {})).toThrow();
  });
});

it("exercises auth, paginated history, tools, session creation, send, SSE and cancel through the real SDK", async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [new LocalStub().toVitePlugin()], server: { host: "127.0.0.1", port: 0 }, appType: "custom" });
  await server.listen();
  const address = server.httpServer!.address() as import("node:net").AddressInfo;
  const apiUrl = `http://127.0.0.1:${address.port}`;
  const client = new CaltraClient({ apiUrl, authorizationCodeProvider: async () => {
    const response = await fetch(`${apiUrl}/api/client-authorization`, { method: "POST" });
    return (await response.json()).authorization_code;
  } });
  expect((await fetch(`${apiUrl}/client/v1/sessions`)).status).toBe(401);
  const agent = await client.agents.get();
  const saved = (await client.listSessions()).data[0]!;
  const page = await client.listSessionMessages(saved.id);
  expect(page.data).toHaveLength(20);
  expect(page.next_cursor).toBe("40");
  expect((await client.listSessionMessages(saved.id, { cursor: page.next_cursor! })).data[0]!.text).toContain("Saved message 21");
  const reasoningMessage = page.data.find(message => message.reasoning)!;
  expect((await client.getSessionReasoning(saved.id, reasoningMessage.id)).parts[0]!.text).toContain("Simulated reasoning summary");
  const toolMessage = page.data.find(message => message.tool_calls?.length)!;
  expect((await client.getSessionToolDetails(saved.id, toolMessage.id, toolMessage.tool_calls![0]!.id)).arguments).toEqual({ text: "Loaded on expansion" });
  const session = await client.agents.sessions(agent.id).create();
  expect(session.id).not.toBe(saved.id);
  expect((await client.listSessionMessages(session.id)).data).toHaveLength(0);
  const connection = await client.openSessionEvents(session.id);
  const iterator = connection[Symbol.asyncIterator]();
  const next = iterator.next();
  await client.sendMessage(session.id, { text: "Check transport" });
  expect((await next).value?.event).toBe("session.updated");
  expect((await client.getSessionById(session.id)).is_running).toBe(true);
  await client.cancelSession(session.id);
  await connection.close();
  expect((await client.getSessionById(session.id)).is_running).toBe(false);
  expect((await client.listSessionMessages(session.id)).data[0]!.text).toBe("Check transport");
  const runtime = client.createSessionRuntime({ sessionId: session.id });
  await runtime.start();
  const available = await client.getSessionModelChoices(session.id);
  expect(available.choices.filter(choice => choice.platform_model_id === demoReasoningModelId).map(choice => choice.reasoning_level)).toEqual([null, "low", "high"]);
  await expect(client.sendMessage(session.id, { text: "reject unsupported", modelSelection: { platformModelId: demoFastModelId, reasoningLevel: "high" } })).rejects.toThrow();
  runtime.setModelSelection({ platformModelId: demoReasoningModelId, reasoningLevel: "high" });
  await runtime.send("Explain a test using the selected model");
  expect(() => runtime.setModelSelection(undefined)).toThrow("current reply");
  await vi.waitFor(() => expect(runtime.getSnapshot().messages.some(message => message.reasoning?.status === "streaming")).toBe(true));
  const thinking = runtime.getSnapshot().messages.find(message => message.reasoning?.status === "streaming")!;
  const reasoning = runtime.reasoning(thinking.id);
  try {
    await reasoning.start();
    await vi.waitFor(() => expect(reasoning.getSnapshot().parts[0]!.text).toContain("high effort"), { timeout: 2500 });
    await vi.waitFor(() => expect(runtime.getSnapshot().isRunning).toBe(false), { timeout: 6000 });
    expect(reasoning.getSnapshot().error).toBeNull();
    expect((await client.getSessionReasoning(session.id, thinking.id)).status).toBe("completed");
    expect(runtime.getSnapshot().messages.find(message => message.id === thinking.id)?.text).toBe("Thinking demo complete.");
  } finally { await reasoning.stop(); await runtime.stop(); }
}, 15_000);


it("accepts both options through npm argument forwarding", () => {
  const directory = mkdtempSync(join(tmpdir(), "caltra-demo-cli-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ scripts: { demo: "node capture.cjs" } }));
    writeFileSync(join(directory, "capture.cjs"), 'console.log(JSON.stringify({args:process.argv.slice(2),key:process.env.npm_config_caltra_api_key,stub:process.env.npm_config_local_stub}))');
    const keyRun = spawnSync("npm", ["run", "demo", "--", "--caltra-api-key", "sample-key"], { cwd: directory, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    expect(keyRun.status, keyRun.stderr).toBe(0);
    const wire = JSON.parse(keyRun.stdout.trim().split("\n").at(-1)!);
    expect(new DemoConfig(wire.args, { npm_config_caltra_api_key: wire.key }).environment.CALTRA_API_KEY).toBe("sample-key");
    const stubRun = spawnSync("npm", ["run", "demo", "--", "--local-stub"], { cwd: directory, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    expect(stubRun.status, stubRun.stderr).toBe(0);
    const stub = JSON.parse(stubRun.stdout.trim().split("\n").at(-1)!);
    expect(new DemoConfig(stub.args, { npm_config_local_stub: stub.stub, CALTRA_API_KEY: "inherited" }).environment.CALTRA_DEMO_MODE).toBe("stub");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
