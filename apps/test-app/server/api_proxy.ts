import type { Plugin, ProxyOptions } from "vite";
import type { IncomingMessage } from "node:http";

/** Loopback/private-preview BFF: validates the browser origin before forwarding client API traffic. */
export class TestAppApiProxy {
  constructor(private readonly apiUrl: string) {}

  static browserOrigin(request: IncomingMessage): string {
    const source = request.headers.origin ?? request.headers.referer;
    if (!source) throw new Error("Browser origin is required.");
    const origin = new URL(source).origin;
    if (new URL(origin).host !== request.headers.host) throw new Error("Cross-origin demo access is not allowed.");
    return origin;
  }

  static upstreamOrigin(origin: string): string {
    const url = new URL(origin);
    // Production accepts HTTPS client origins. A loopback-only BFF represents the local
    // browser with an HTTPS origin upstream; it enforces the real HTTP origin locally.
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.protocol = "https:";
    return url.origin;
  }

  toVitePlugin(): Plugin {
    const proxy: ProxyOptions = { target: this.apiUrl, changeOrigin: true,
      bypass: (request, response) => {
        try { TestAppApiProxy.browserOrigin(request); }
        catch { response!.statusCode = 403; response!.end("Demo requests must come from this browser origin."); return false; }
      },
      configure: proxy => proxy.on("proxyReq", (upstream, request) => {
        upstream.setHeader("origin", TestAppApiProxy.upstreamOrigin(TestAppApiProxy.browserOrigin(request)));
        // The private Sprite edge reserves Authorization for its own authentication.
        const authorization = request.headers["x-preview-authorization"];
        if (request.url?.startsWith("/caltra/v1/auth/authenticate")) upstream.removeHeader("authorization");
        else if (authorization) upstream.setHeader("authorization", authorization);
        else if (request.headers.host?.endsWith(".sprites.app")) upstream.removeHeader("authorization");
        upstream.removeHeader("x-preview-authorization");
        upstream.removeHeader("cookie");
        upstream.removeHeader("referer");
      }),
    };
    return { name: "caltra-demo-api-proxy", config: () => ({ server: { proxy: { "/client/v1": proxy, "/caltra/v1/auth/authenticate": proxy } } }) };
  }
}
