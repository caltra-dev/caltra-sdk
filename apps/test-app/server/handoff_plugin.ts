import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { TestAppHandoffProxy } from "./handoff_proxy.js";

/** Adds the local authenticated handoff endpoint to Vite's development server. */
export class TestAppHandoffPlugin {
  constructor(private readonly proxy: TestAppHandoffProxy) {}

  toVitePlugin(): Plugin {
    return {
      name: "caltra-test-app-client-handoff",
      configureServer: (server) => {
        server.middlewares.use("/api/client-handoff", async (request, response, next) => {
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
      const handoff = await this.proxy.create(origin);
      response.statusCode = 201;
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(handoff));
    } catch (error) {
      response.statusCode = 502;
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Client handoff creation failed.",
      }));
    }
  }
}
