import { describe, expect, it, vi } from "vitest";
import { TestAppServerConfig } from "../server/config.js";
import { TestAppTokenProxy } from "../server/token_proxy.js";

describe("TestAppTokenProxy", () => {
  it("keeps the API key server-side while binding a client token to the browser origin", async () => {
    const apiKey = "csk_test_server_secret";
    const fetchImplementation = vi.fn(async () => Response.json({
      client_token: "browser-token",
      expires_at: "2026-08-26T18:00:00.000Z",
      refresh_after: "2026-08-26T17:50:00.000Z",
    }, { status: 201 }));
    const config = new TestAppServerConfig({
      CALTRA_API_KEY: apiKey,
      CALTRA_API_URL: "http://api.caltra/",
      CALTRA_TENANT_USER_EXTERNAL_ID: "sdk-user",
      CALTRA_WORKSPACE_ID: "20000000-0000-4000-8000-000000000001",
    });
    const proxy = new TestAppTokenProxy(config, fetchImplementation as typeof fetch);

    const response = await proxy.exchange("http://localhost:5173");

    expect(response).toEqual({
      api_url: "http://api.caltra",
      client_token: "browser-token",
      expires_at: "2026-08-26T18:00:00.000Z",
      refresh_after: "2026-08-26T17:50:00.000Z",
    });
    expect(JSON.stringify(response)).not.toContain(apiKey);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://api.caltra/server/v1/workspaces/20000000-0000-4000-8000-000000000001/client-tokens",
      expect.objectContaining({
        body: JSON.stringify({
          origin: "http://localhost:5173",
          tenant_user: { external_id: "sdk-user" },
        }),
        headers: expect.objectContaining({ authorization: `Bearer ${apiKey}` }),
        method: "POST",
      }),
    );
  });

  it("rejects missing server secrets before the development server starts", () => {
    expect(() => new TestAppServerConfig({
      CALTRA_API_URL: "http://api.caltra",
      CALTRA_WORKSPACE_ID: "20000000-0000-4000-8000-000000000001",
    })).toThrow();
  });
});
