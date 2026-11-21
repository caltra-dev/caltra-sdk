import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { CaltraClient, ClerkAuthProvider } from "../src/index.js";

it("opens a workspace once across concurrent requests and switches authority with the Clerk session", async () => {
  let session: string | null = "first-session";
  const workspace = { createIfMissing: { key: "personal", name: "Personal" } };
  const providerId = randomUUID();
  const ids = [randomUUID(), randomUUID()];
  const fetchImplementation = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(url).toBe("https://api.example/caltra/v1/auth/clerk/exchange");
    expect(JSON.parse(String(init?.body))).toEqual({ provider_id: providerId, workspace: { create_if_missing: workspace.createIfMissing } });
    const token = new Headers(init?.headers).get("authorization");
    return Response.json({ client_token: "short-lived", workspace_id: ids[token === "Bearer first-session" ? 0 : 1],
      expires_at: new Date(Date.now() + 60000).toISOString(), refresh_after: new Date(Date.now() + 30000).toISOString() });
  });
  const client = new CaltraClient({ auth: new ClerkAuthProvider({ providerId, workspace, getToken: async () => session }),
    apiUrl: "https://api.example", fetch: fetchImplementation });
  expect(await Promise.all([client.connectWorkspace(),client.connectWorkspace()])).toEqual([{id:ids[0]},{id:ids[0]}]);
  session = null;
  await expect(client.connectWorkspace()).rejects.toThrow(/Sign in/);
  expect(fetchImplementation).toHaveBeenCalledTimes(1);
  session = "second-session";
  expect(await client.connectWorkspace()).toEqual({id:ids[1]});
  expect(fetchImplementation).toHaveBeenCalledTimes(2);
});
