import { describe, expect, it } from "vitest";
import { CaltraApiError } from "../src/error.js";
import { CaltraClient } from "../src/client.js";

const profileId = "30000000-0000-4000-8000-000000000001";
const sessionId = "40000000-0000-4000-8000-000000000001";
const identityId = "50000000-0000-4000-8000-000000000001";
const userId = "60000000-0000-4000-8000-000000000001";

interface Recorded { url: string; method: string; body: unknown; keepalive?: boolean }

function clientWith(respond: (call: Recorded) => Response) {
  const calls: Recorded[] = [];
  const client = new CaltraClient({
    apiUrl: "https://caltra.example", authorizationCodeProvider: async () => "code",
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/authenticate")) {
        return Response.json({ client_token: "test", expires_at: new Date(Date.now() + 600000).toISOString(), refresh_after: new Date(Date.now() + 500000).toISOString() });
      }
      const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, keepalive: init?.keepalive };
      calls.push(call);
      return respond(call);
    },
  });
  return { client, calls };
}

const problem = (status: number, code: string) => new Response(JSON.stringify({
  type: `https://api.caltra.dev/problems/${code}`, title: "t", status, code, detail: "d", request_id: "r", retryable: false,
}), { status, headers: { "content-type": "application/problem+json" } });

describe("browser profiles client", () => {
  it("creates a profile with snake_case body and maps the camelCase response", async () => {
    const { client, calls } = clientWith(() => Response.json({
      id: profileId, name: "Shop", dedicated_sticky_ip: true, active_session: null,
    }, { status: 201 }));
    const profile = await client.browserProfiles.create({ name: "Shop", dedicatedStickyIp: true });
    expect(calls[0]).toMatchObject({ url: "https://caltra.example/client/v1/browser-profiles", method: "POST", body: { name: "Shop", dedicated_sticky_ip: true } });
    expect(profile).toEqual({ id: profileId, name: "Shop", dedicatedStickyIp: true, activeSession: null });
  });

  it("lists profiles with role and active session", async () => {
    const { client } = clientWith(() => Response.json({ data: [{
      id: profileId, name: "Shop", dedicated_sticky_ip: false, role: "operator",
      active_session: { id: sessionId, started_at: "2026-11-22T00:00:00Z", controlled_by: "user" },
    }] }));
    expect(await client.browserProfiles.list()).toEqual([{
      id: profileId, name: "Shop", dedicatedStickyIp: false, role: "operator",
      activeSession: { id: sessionId, startedAt: "2026-11-22T00:00:00Z", controlledBy: "user" },
    }]);
  });

  it("grants and revokes members for agents and users, then deletes", async () => {
    const { client, calls } = clientWith(() => new Response(null, { status: 204 }));
    await client.browserProfiles.addMember(profileId, { agentIdentityId: identityId }, "operator");
    await client.browserProfiles.addMember(profileId, { tenantUserId: userId }, "viewer");
    await client.browserProfiles.removeMember(profileId, { agentIdentityId: identityId });
    await client.browserProfiles.delete(profileId);
    const base = `https://caltra.example/client/v1/browser-profiles/${profileId}`;
    expect(calls).toMatchObject([
      { url: `${base}/members`, method: "PUT", body: { agent_identity_id: identityId, role: "operator" } },
      { url: `${base}/members`, method: "PUT", body: { tenant_user_id: userId, role: "viewer" } },
      { url: `${base}/members`, method: "DELETE", body: { agent_identity_id: identityId } },
      { url: base, method: "DELETE" },
    ]);
  });

  it("maps live view, control, heartbeat and release", async () => {
    const { client, calls } = clientWith(({ url, method }) => {
      if (url.endsWith("/live-view")) return Response.json({ url: "https://view/ro", mode: "read_only", session_id: sessionId });
      if (url.endsWith("/heartbeat")) return Response.json({ expires_at: "2026-11-22T00:01:00Z" });
      if (method === "POST") return Response.json({ url: "https://view/rw", mode: "interactive", expires_at: "2026-11-22T00:00:45Z" });
      return new Response(null, { status: 204 });
    });
    expect(await client.browserProfiles.liveView(profileId)).toEqual({ url: "https://view/ro", mode: "read_only", sessionId });
    expect(await client.browserProfiles.takeControl(profileId)).toEqual({ url: "https://view/rw", mode: "interactive", expiresAt: "2026-11-22T00:00:45Z" });
    expect(await client.browserProfiles.heartbeat(profileId)).toEqual({ expiresAt: "2026-11-22T00:01:00Z" });
    await client.browserProfiles.releaseControl(profileId, { keepalive: true });
    const base = `https://caltra.example/client/v1/browser-profiles/${profileId}`;
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", `${base}/live-view`], ["POST", `${base}/control`], ["POST", `${base}/control/heartbeat`], ["DELETE", `${base}/control`],
    ]);
    expect(calls[3]!.keepalive).toBe(true);
  });

  it.each([
    [404, "resource_not_found"], [400, "invalid_request"], [503, "browser_unavailable"], [502, "browser_provider_error"],
    [409, "no_active_session"], [409, "controlled_by_other_user"], [409, "not_controller"],
  ])("surfaces %i %s as CaltraApiError with the server code", async (status, code) => {
    const { client } = clientWith(() => problem(status, code));
    const error = await client.browserProfiles.takeControl(profileId).catch((caught) => caught);
    expect(error).toBeInstanceOf(CaltraApiError);
    expect(error).toMatchObject({ code, status });
    const noContent = await client.browserProfiles.releaseControl(profileId).catch((caught) => caught);
    expect(noContent).toMatchObject({ code, status });
  });
});
