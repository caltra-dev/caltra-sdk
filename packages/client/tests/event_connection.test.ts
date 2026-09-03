import { describe, expect, it } from "vitest";
import { CaltraClient } from "../src/index.js";

const sessionId = "40000000-0000-4000-8000-000000000001";
const messageId = "50000000-0000-4000-8000-000000000001";
const turnId = "60000000-0000-4000-8000-000000000001";

describe("CaltraSessionEventConnection", () => {
  it("parses lifecycle events split across arbitrary response chunks", async () => {
    const payload = [
      `id: stream:started\nevent: message.started\ndata: ${JSON.stringify({
        message_id: messageId,
        session_id: sessionId,
        turn_id: turnId,
      })}\n\n`,
      `id: stream:0\nevent: message.delta\ndata: ${JSON.stringify({
        delta: "Hello",
        message_id: messageId,
        session_id: sessionId,
        turn_id: turnId,
      })}\n\n`,
      `id: stream:completed\nevent: message.completed\ndata: ${JSON.stringify({
        message_id: messageId,
        session_id: sessionId,
        turn_id: turnId,
      })}\n\n`,
    ].join("");
    const bytes = new TextEncoder().encode(payload);
    const splitPoints = [7, 31, 88, bytes.length];
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const end = splitPoints.shift();
        if (end === undefined) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      },
    });
    const client = new CaltraClient({
      apiUrl: "https://api.example.test",
      authorizationCodeProvider: async () => "cac_test",
      fetch: (async (input) => input.toString().endsWith("/caltra/v1/auth/authenticate")
        ? Response.json({
          client_token: "client-token",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          refresh_after: new Date(Date.now() + 540_000).toISOString(),
        })
        : new Response(body, {
          headers: { "content-type": "text/event-stream; charset=utf-8" },
        })) as typeof fetch,
    });

    const connection = await client.openSessionEvents(sessionId);
    const events = [];
    for await (const event of connection) events.push(event);

    expect(events.map((event) => event.event)).toEqual([
      "message.started",
      "message.delta",
      "message.completed",
    ]);
    expect(events[1]).toMatchObject({ data: { delta: "Hello" }, id: "stream:0" });
  });
});
