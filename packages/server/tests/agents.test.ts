import { describe, expect, it, vi } from "vitest";
import { CaltraServerClient } from "../src/index.js";

const workspaceId = "40000000-0000-4000-8000-000000000001";
const agentId = "50000000-0000-4000-8000-000000000001";

describe("CaltraAgentsClient", () => {
  it("provisions a stable tenant-user-owned agent", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({
      external_id: "personal-assistant",
      id: agentId,
      name: "Piria Assistant",
    }));
    const client = new CaltraServerClient({
      apiKey: "csk_live_test",
      apiUrl: "https://api.example.test",
      fetch: fetchImplementation as typeof fetch,
    });

    await expect(client.agents.get({
      createIfMissing: {
        instructions: "Help with accounting.",
        name: "Piria Assistant",
      },
      externalId: "personal-assistant",
      owner: { tenantUserExternalId: "piria-user-1" },
      workspaceId,
    })).resolves.toEqual({
      externalId: "personal-assistant",
      id: agentId,
      name: "Piria Assistant",
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      `https://api.example.test/server/v1/workspaces/${workspaceId}/agents/get`,
      expect.objectContaining({
        body: JSON.stringify({
          create_if_missing: {
            browser_visible: true,
            description: "",
            instructions: "Help with accounting.",
            name: "Piria Assistant",
          },
          external_id: "personal-assistant",
          owner: { tenant_user_external_id: "piria-user-1" },
        }),
        method: "POST",
      }),
    );
  });
});
