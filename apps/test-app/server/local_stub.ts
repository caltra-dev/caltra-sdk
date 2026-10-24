import { z } from "zod";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { DemoClient, demoSessionId } from "../src/demo/client.js";

/** In-process HTTP API simulator. The browser still uses the unmodified Caltra SDK transport. */
export class LocalStub {
  private readonly sessions = new Map([[demoSessionId, new DemoClient()]]);
  toVitePlugin(): Plugin {
    return { name: "caltra-local-stub", configureServer: server => {
      server.httpServer?.once("close", () => { for (const client of this.sessions.values()) client.disposeTimers(); });
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? "/", "http://stub.local").pathname;
        if (!["/client/v1/", "/caltra/v1/", "/api/client-authorization"].some(prefix => path.startsWith(prefix))) return next();
        void this.respond(request, response).catch(() => {
          if (!response.headersSent) { response.statusCode = 400; response.end(JSON.stringify({ error: "Invalid local stub request." })); }
          else response.end();
        });
      });
    } };
  }
  private async respond(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://stub.local");
    const path = url.pathname;
    response.setHeader("cache-control", "no-store");
    const json = (body: unknown, status = 200) => { response.statusCode = status; response.setHeader("content-type", "application/json"); response.end(JSON.stringify(body)); };
    if (path === "/api/client-authorization" && request.method === "POST") return json({ authorization_code: "local-stub-code", expires_at: new Date(Date.now() + 60_000).toISOString() }, 201);
    const body = request.method === "POST" ? await this.body(request) : {};
    if (path === "/caltra/v1/auth/authenticate" && request.method === "POST") {
      if (body.authorization_code !== "local-stub-code") return json({ error: "Invalid stub code" }, 401);
      return json({ client_token: "local-stub-token", refresh_after: new Date(Date.now() + 1800_000).toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString() });
    }
    if ((request.headers.authorization ?? request.headers["x-preview-authorization"]) !== "Bearer local-stub-token") return json({ error: "Missing stub token" }, 401);
    if (path === "/client/v1/agents/get" && request.method === "POST") return json({ id: demoSessionId, name: "Local demo assistant" });
    if (path === "/client/v1/sessions" && request.method === "GET") return json({ data: await Promise.all([...this.sessions].reverse().map(([id, client]) => client.getSessionById(id))), next_cursor: null });
    if (path === `/client/v1/agents/${demoSessionId}/sessions` && request.method === "POST") {
      const id = crypto.randomUUID(); const client = new DemoClient(id); client.messages = []; this.sessions.set(id, client);
      return json(await client.getSessionById(id), 201);
    }
    const match = /^\/client\/v1\/sessions\/([^/]+)(.*)$/.exec(path);
    const client = match && this.sessions.get(match[1]!);
    if (!match || !client) return json({ error: "Unknown stub route or session" }, 404);
    const id = match[1]!; const suffix = match[2];
    if (suffix === "/model-choices" && request.method === "GET") return json(await client.getSessionModelChoices(id));
    if (!suffix && request.method === "GET") return json(await client.getSessionById(id));
    if (suffix === "/messages" && request.method === "GET") {
      const page = await client.listSessionMessages(id, { ...(url.searchParams.has("cursor") ? { cursor: url.searchParams.get("cursor")! } : {}) });
      return json(page);
    }
    if (suffix === "/messages" && request.method === "POST") {
      const input = z.object({ text: z.string().min(1), request_id: z.string().uuid().optional(), model_selection: z.object({ platform_model_id: z.string().uuid(), reasoning_level: z.string().nullable() }).strict().optional() }).strict().parse(body);
      return json(await client.sendMessage(id, { text: input.text, ...(input.model_selection ? { modelSelection: { platformModelId: input.model_selection.platform_model_id, reasoningLevel: input.model_selection.reasoning_level } } : {}) }), 202);
    }
    if (suffix === "/cancel" && request.method === "POST") return json(await client.cancelSession());
    const tool = /^\/messages\/([^/]+)\/tools\/([^/]+)$/.exec(suffix!);
    if (tool && request.method === "GET") return json(await client.getSessionToolDetails(id, tool[1]!, tool[2]!));
    const reasoning = /^\/messages\/([^/]+)\/reasoning(\/events)?$/.exec(suffix!);
    if (reasoning && request.method === "GET" && !reasoning[2]) return json(await client.getSessionReasoning(id, reasoning[1]!));
    if ((suffix === "/events" || reasoning?.[2]) && request.method === "GET") {
      const controller = new AbortController();
      const stream = client.eventResponse({ signal: controller.signal, reasoning: Boolean(reasoning) });
      response.setHeader("content-type", "text/event-stream"); response.flushHeaders();
      response.on("close", () => controller.abort());
      Readable.fromWeb(stream.body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(response);
      return;
    }
    return json({ error: "Unsupported stub operation" }, 404);
  }
  private async body(request: IncomingMessage): Promise<Record<string, unknown>> {
    let content = "";
    for await (const chunk of request) { content += chunk; if (content.length > 65_536) throw new Error("Request too large"); }
    return content ? JSON.parse(content) : {};
  }
}
