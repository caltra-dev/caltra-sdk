import { describe, expect, it, vi } from "vitest";
import { TestAppAuthorizationProxy } from "../server/authorization_proxy.js";
import { TestAppServerConfig } from "../server/config.js";

describe("TestAppAuthorizationProxy", () => {
  it("keeps the API key server-side while returning only a one-time authorization code", async () => {
    const apiKey = "csk_test_server_secret";
    const fetchImplementation = vi.fn(async () => Response.json({
      authorization_code: "cac_single_use",
      expires_at: "2026-08-26T17:41:00.000Z",
    }, { status: 201 }));
    const config = new TestAppServerConfig({
      CALTRA_API_KEY: apiKey,
      CALTRA_API_URL: "http://api.caltra/",
      CALTRA_TENANT_USER_EXTERNAL_ID: "sdk-user",
      CALTRA_WORKSPACE_ID: "20000000-0000-4000-8000-000000000001",
    });
    const proxy = new TestAppAuthorizationProxy(config, fetchImplementation as typeof fetch);

    const response = await proxy.create("http://localhost:5173");

    expect(response).toEqual({
      authorization_code: "cac_single_use",
      expires_at: "2026-08-26T17:41:00.000Z",
    });
    expect(JSON.stringify(response)).not.toContain(apiKey);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://api.caltra/server/v1/workspaces/20000000-0000-4000-8000-000000000001/client-authorizations",
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

  it("uses npm command-line options ahead of matching environment values", () => {
    const config = new TestAppServerConfig({
      CALTRA_API_KEY: "csk_from_env",
      CALTRA_API_URL: "https://env-api.caltra.dev",
      CALTRA_TENANT_USER_EXTERNAL_ID: "env-user",
      CALTRA_WORKSPACE_ID: "20000000-0000-4000-8000-000000000001",
      npm_config_api_key: "csk_from_cli",
      npm_config_caltra_url: "https://cli-api.caltra.dev",
      npm_config_tenant_user_external_id: "cli-user",
      npm_config_workspace_id: "30000000-0000-4000-8000-000000000002",
    });

    expect(config.apiKey).toBe("csk_from_cli");
    expect(config.apiUrl).toBe("https://cli-api.caltra.dev");
    expect(config.tenantUserExternalId).toBe("cli-user");
    expect(config.workspaceId).toBe("30000000-0000-4000-8000-000000000002");
  });

  it("falls back to environment values for omitted npm command-line options", () => {
    const config = new TestAppServerConfig({
      CALTRA_API_KEY: "csk_from_env",
      CALTRA_API_URL: "https://env-api.caltra.dev",
      CALTRA_TENANT_USER_EXTERNAL_ID: "env-user",
      CALTRA_WORKSPACE_ID: "20000000-0000-4000-8000-000000000001",
      npm_config_caltra_url: "https://cli-api.caltra.dev",
    });

    expect(config.apiKey).toBe("csk_from_env");
    expect(config.apiUrl).toBe("https://cli-api.caltra.dev");
    expect(config.tenantUserExternalId).toBe("env-user");
    expect(config.workspaceId).toBe("20000000-0000-4000-8000-000000000001");
  });
});
