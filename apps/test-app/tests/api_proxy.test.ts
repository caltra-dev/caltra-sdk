import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { TestAppApiProxy } from "../server/api_proxy.js";

describe("Demo origin boundary", () => {
  it("accepts same-origin browser requests and represents loopback upstream with HTTPS", () => {
    const request = { headers: { host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" } } as IncomingMessage;
    expect(TestAppApiProxy.upstreamOrigin(TestAppApiProxy.browserOrigin(request))).toBe("https://127.0.0.1:5173");
    expect(TestAppApiProxy.upstreamOrigin("https://preview.sprites.app")).toBe("https://preview.sprites.app");
    expect(TestAppApiProxy.browserOrigin({ headers: { host: "localhost:5173", referer: "http://localhost:5173/thread.html" } } as IncomingMessage)).toBe("http://localhost:5173");
  });
  it("rejects cross-origin and originless proxy requests instead of forwarding credentials", () => {
    expect(() => TestAppApiProxy.browserOrigin({ headers: { host: "localhost:5173", origin: "https://attacker.example" } } as IncomingMessage)).toThrow();
    expect(() => TestAppApiProxy.browserOrigin({ headers: { host: "localhost:5173" } } as IncomingMessage)).toThrow();
    expect(TestAppApiProxy.upstreamOrigin("http://public.example")).toBe("http://public.example");
  });
});

it("forwards the client token and SSE through the proxy without cookies or edge credentials", async () => {
  const { createServer: httpServer } = await import("node:http");
  const { createServer } = await import("vite");
  const seen: Array<import("node:http").IncomingHttpHeaders> = [];
  const upstream = httpServer((request, response) => {
    seen.push(request.headers);
    response.setHeader("content-type", "text/event-stream");
    response.end("event: ready\ndata: {}\n\n");
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = (upstream.address() as import("node:net").AddressInfo).port;
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, appType: "custom",
    plugins: [new TestAppApiProxy(`http://127.0.0.1:${upstreamPort}`).toVitePlugin()], server: { host: "127.0.0.1", port: 0 } });
  try {
    await server.listen();
    const base = `http://127.0.0.1:${(server.httpServer!.address() as import("node:net").AddressInfo).port}`;
    const response = await fetch(`${base}/client/v1/sessions/example/events`, { headers: { origin: base, cookie: "private-cookie", authorization: "Bearer edge-secret", "x-preview-authorization": "Bearer client-token" } });
    expect(await response.text()).toContain("event: ready");
    expect(seen[0]!.authorization).toBe("Bearer client-token");
    expect(seen[0]!.origin).toBe(base.replace("http:", "https:"));
    expect(seen[0]!.cookie).toBeUndefined();
    expect(seen[0]!["x-preview-authorization"]).toBeUndefined();
    await fetch(`${base}/caltra/v1/auth/authenticate`, { method: "POST", headers: { origin: base, authorization: "Bearer edge-secret" } });
    expect(seen[1]!.authorization).toBeUndefined();
    expect((await fetch(`${base}/client/v1/sessions`, { headers: { origin: "https://unrelated.example" } })).status).toBe(403);
    expect(seen).toHaveLength(2);
  } finally { await server.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
