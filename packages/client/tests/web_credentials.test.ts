import { describe, expect, it } from "vitest";
import { CaltraApiError } from "../src/error.js";
import { CaltraClient } from "../src/client.js";

const credentialId = "70000000-0000-4000-8000-000000000001";
const identityId = "50000000-0000-4000-8000-000000000001";
const userId = "60000000-0000-4000-8000-000000000001";

function clientWith(respond: (call: { url: string; method: string; body: unknown }) => Response) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const client = new CaltraClient({
    apiUrl: "https://caltra.example", authorizationCodeProvider: async () => "code",
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/authenticate")) {
        return Response.json({ client_token: "test", expires_at: new Date(Date.now() + 600000).toISOString(), refresh_after: new Date(Date.now() + 500000).toISOString() });
      }
      const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      return respond(call);
    },
  });
  return { client, calls };
}

const credential = { id: credentialId, label: "Shop", origin: "https://shop.example", username: "ann", created_at: "2026-11-22T00:00:00Z" };

describe("web credentials client", () => {
  it("creates with the password on the wire only and returns camelCase without it", async () => {
    const { client, calls } = clientWith(() => Response.json(credential, { status: 201 }));
    const created = await client.webCredentials.create({ label: "Shop", origin: "https://shop.example", username: "ann", password: "s3cret" });
    expect(calls[0]).toMatchObject({ url: "https://caltra.example/client/v1/web-credentials", method: "POST", body: { label: "Shop", origin: "https://shop.example", username: "ann", password: "s3cret" } });
    expect(created).toEqual({ id: credentialId, label: "Shop", origin: "https://shop.example", username: "ann", createdAt: "2026-11-22T00:00:00Z" });
    expect(JSON.stringify(created)).not.toContain("s3cret");
  });

  it("lists, shares, unshares and deletes", async () => {
    const { client, calls } = clientWith(({ method, url }) => method === "GET" && url.endsWith("/web-credentials")
      ? Response.json({ data: [credential] }) : new Response(null, { status: 204 }));
    expect(await client.webCredentials.list()).toHaveLength(1);
    await client.webCredentials.addMember(credentialId, { agentIdentityId: identityId });
    await client.webCredentials.removeMember(credentialId, { tenantUserId: userId });
    await client.webCredentials.delete(credentialId);
    const base = `https://caltra.example/client/v1/web-credentials/${credentialId}`;
    expect(calls.slice(1)).toEqual([
      { url: `${base}/members`, method: "PUT", body: { agent_identity_id: identityId } },
      { url: `${base}/members`, method: "DELETE", body: { tenant_user_id: userId } },
      { url: base, method: "DELETE", body: undefined },
    ]);
  });

  it("surfaces invalid_request problems as CaltraApiError", async () => {
    const { client } = clientWith(() => new Response(JSON.stringify({
      type: "x", title: "Invalid request", status: 400, code: "invalid_request", detail: "Origin must be an http or https origin.", request_id: "r", retryable: false,
    }), { status: 400, headers: { "content-type": "application/problem+json" } }));
    const error = await client.webCredentials.create({ label: "a", origin: "nope", username: "u", password: "p" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(CaltraApiError);
    expect(error).toMatchObject({ code: "invalid_request", status: 400 });
  });
});
