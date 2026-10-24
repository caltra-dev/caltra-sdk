import { createServer as httpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { CaltraClient } from "@caltra/client";
import { demoConnectionSettings } from "../server/connections.js";
import { LocalStub } from "../server/local_stub.js";
import { TestAppApiProxy } from "../server/api_proxy.js";
import { TestAppAuthorizationPlugin } from "../server/authorization_plugin.js";
import { TestAppAuthorizationProxy } from "../server/authorization_proxy.js";
import { TestAppServerConfig } from "../server/config.js";

it("exposes only connection availability, respects stub isolation, and rejects missing real credentials", () => {
  expect(demoConnectionSettings({})).toEqual({ realApiAvailable: false, defaultConnection: "stub" });
  expect(demoConnectionSettings({ CALTRA_API_KEY: "server-only-secret" })).toEqual({ realApiAvailable: true, defaultConnection: "real" });
  expect(demoConnectionSettings({ npm_config_caltra_api_key: "cli-secret" }).realApiAvailable).toBe(true);
  expect(demoConnectionSettings({ CALTRA_API_KEY: "server-only-secret", CALTRA_DEMO_MODE: "stub" }).realApiAvailable).toBe(false);
  expect(() => demoConnectionSettings({ CALTRA_DEMO_MODE: "real" })).toThrow("requires CALTRA_API_KEY");
});

it("keeps both API connections available on one server with separate tokens and authorization routes", async () => {
  const seen: Array<{ path: string; token?: string }> = [];
  const realAgent = { id: "20000000-0000-4000-8000-000000000001", name: "Real test assistant" };
  const upstream = httpServer((request, response) => {
    seen.push({ path: request.url!, token: request.headers.authorization });
    response.setHeader("content-type", "application/json");
    if (request.url?.includes("client-authorizations")) {
      response.statusCode = 201;
      response.end(JSON.stringify({ authorization_code: "real-code", expires_at: new Date(Date.now() + 60_000).toISOString() }));
    } else if (request.url === "/caltra/v1/auth/authenticate") {
      response.end(JSON.stringify({ client_token: "real-token", refresh_after: new Date(Date.now() + 1800_000).toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString() }));
    } else response.end(JSON.stringify(realAgent));
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const config = new TestAppServerConfig({ CALTRA_API_KEY: "server-only-secret", CALTRA_API_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`, CALTRA_WORKSPACE_ID: realAgent.id });
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, appType: "custom", server: { host: "127.0.0.1", port: 0 },
    plugins: [new LocalStub().toVitePlugin("/demo/stub"), new TestAppApiProxy(config.apiUrl).toVitePlugin(), new TestAppAuthorizationPlugin(new TestAppAuthorizationProxy(config)).toVitePlugin()] });
  try {
    await server.listen();
    const base = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
    const connect = (prefix: string) => new CaltraClient({ apiUrl: base + prefix,
      fetch: (input, init) => { const request = new Request(input, init); request.headers.set("origin", base); return fetch(request); },
      authorizationCodeProvider: async () => {
        const response = await fetch(`${base}${prefix}/api/client-authorization`, { method: "POST", headers: { origin: base } });
        const body = await response.text();
        expect(body).not.toContain("server-only-secret");
        return JSON.parse(body).authorization_code;
      },
    });
    const stub = connect("/demo/stub");
    const real = connect("");
    expect((await stub.agents.get()).name).toBe("Local demo assistant");
    expect(seen).toHaveLength(0);
    const { id, name } = await real.agents.get();
    expect({ id, name }).toEqual(realAgent);
    expect(seen).toEqual([
      { path: `/server/v1/workspaces/${realAgent.id}/client-authorizations`, token: "Bearer server-only-secret" },
      { path: "/caltra/v1/auth/authenticate", token: undefined },
      { path: "/client/v1/agents/get", token: "Bearer real-token" },
    ]);
    expect((await stub.listSessions()).data.length).toBeGreaterThan(0);
    expect(seen).toHaveLength(3);
    expect((await fetch(`${base}/demo/stub/client/v1/sessions`, { headers: { authorization: "Bearer real-token" } })).status).toBe(401);
    expect((await fetch(`${base}/client/v1/agents/get`, { method: "POST", headers: { origin: "https://unrelated.example" } })).status).toBe(403);
    expect(seen).toHaveLength(3);
  } finally { await server.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
