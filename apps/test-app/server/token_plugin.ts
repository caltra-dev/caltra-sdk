import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { TestAppTokenProxy } from "./token_proxy.js";

/** Adds the local-only same-origin token endpoint to Vite's development server. */
export class TestAppTokenPlugin {
  constructor(private readonly proxy: TestAppTokenProxy) {}

  toVitePlugin(): Plugin {
    return {
      name: "caltra-test-app-client-token",
      configureServer: (server) => {
        server.middlewares.use("/api/client-token", async (request, response, next) => {
          if (request.method !== "POST") {
            next();
            return;
          }
          await this.respond(request, response);
        });
      },
    };
  }

  private async respond(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const origin = request.headers.origin;
      if (!origin) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "Browser Origin header is required." }));
        return;
      }
      const token = await this.proxy.exchange(origin);
      response.statusCode = 200;
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(token));
    } catch (error) {
      response.statusCode = 502;
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Client token exchange failed.",
      }));
    }
  }
}
