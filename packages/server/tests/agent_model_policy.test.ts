import { describe, expect, it, vi } from "vitest";
import { CaltraServerClient } from "../src/client.js";

const modelId = "10000000-0000-4000-8000-000000000001";
const target = { workspaceId: "workspace/id", agentId: "agent/id" };
const choice = { platformModelId: modelId, reasoningLevel: null };
const wireChoice = { platform_model_id: modelId, reasoning_level: null };
const policy = { inherits_model_policy: true, default: null, effective_default: wireChoice, allowed_choices: [wireChoice] };

describe("server agent model policy", () => {
  it("authenticates reads, encodes both resource IDs and translates only public policy fields", async () => {
    const request = vi.fn(async () => Response.json(policy));
    const client = new CaltraServerClient({ apiKey: "csk_test_example", apiUrl: "https://caltra.example", fetch: request });
    await expect(client.agents.getModelPolicy(target)).resolves.toEqual({ inheritsModelPolicy: true, default: null, effectiveDefault: choice, allowedChoices: [choice] });
    expect(request).toHaveBeenCalledWith("https://caltra.example/server/v1/workspaces/workspace%2Fid/agents/agent%2Fid/model-policy", {
      method: "GET", headers: { authorization: "Bearer csk_test_example" },
    });
  });

  it.each([
    [{ default: choice }, { default: wireChoice }],
    [{ default: null }, { default: null }],
    [{ allowedChoices: [] }, { allowed_choices: [] }],
    [{ default: choice, allowedChoices: [choice] }, { default: wireChoice, allowed_choices: [wireChoice] }],
  ])("preserves omission, inheritance, explicit null reasoning and clearing: %j", async (changes, expected) => {
    const client = new CaltraServerClient({ apiKey: "test", apiUrl: "https://caltra.example", fetch: async (_url, init) => {
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual(expected);
      return Response.json(policy);
    } });
    await client.agents.updateModelPolicy({ ...target, ...changes });
  });

  it.each([400, 401, 403, 404])("propagates policy and authorization problems (%s)", async status => {
    const client = new CaltraServerClient({ apiKey: "test", fetch: async () => Response.json({ code: "policy_denied", detail: "Unavailable", request_id: "request", retryable: false, status, title: "Denied", type: "https://api.caltra.dev/problems/policy-denied" }, { status }) });
    await expect(client.agents.getModelPolicy(target)).rejects.toMatchObject({ status, code: "policy_denied" });
    await expect(client.agents.updateModelPolicy({ ...target, allowedChoices: [] })).rejects.toMatchObject({ status, code: "policy_denied" });
  });

  it("rejects malformed policy responses", async () => {
    const client = new CaltraServerClient({ apiKey: "test", fetch: async () => Response.json({ ...policy, allowed_choices: [{ platform_model_id: "invalid", reasoning_level: null }] }) });
    await expect(client.agents.getModelPolicy(target)).rejects.toThrow();
  });
});
