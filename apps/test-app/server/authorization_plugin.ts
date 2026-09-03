import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { TestAppAuthorizationProxy } from "./authorization_proxy.js";

/** Adds the local authenticated client-authorization endpoint to Vite's development server. */
export class TestAppAuthorizationPlugin {
  constructor(private readonly proxy: TestAppAuthorizationProxy) {}

  toVitePlugin(): Plugin {
    return {
      name: "caltra-test-app-client-authorization",
      configureServer: (server) => {
        server.middlewares.use("/api/client-authorization", async (request, response, next) => {
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
      const authorization = await this.proxy.create(origin);
      response.statusCode = 201;
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(authorization));
    } catch (error) {
      response.statusCode = 502;
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Client authorization creation failed.",
      }));
    }
  }
}
