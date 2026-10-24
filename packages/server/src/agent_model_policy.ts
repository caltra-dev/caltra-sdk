import { z } from "zod";
import { CaltraServerError } from "./error.js";

export interface CaltraAgentModelChoice {
  platformModelId: string;
  /** null uses the provider's automatic reasoning behavior, not a wildcard for every effort. */
  reasoningLevel: string | null;
}

export interface CaltraAgentModelPolicyTarget { workspaceId: string; agentId: string }

export interface CaltraAgentModelPolicyUpdate extends CaltraAgentModelPolicyTarget {
  /** Omit to preserve; null restores inheritance; an explicit pair overrides it for future sessions. */
  default?: CaltraAgentModelChoice | null;
  /** Replaces additional per-turn pairs. Omit to preserve; [] clears. Existing session defaults remain available. */
  allowedChoices?: CaltraAgentModelChoice[];
}

export interface CaltraAgentModelPolicy {
  inheritsModelPolicy: boolean;
  default: CaltraAgentModelChoice | null;
  effectiveDefault: CaltraAgentModelChoice | null;
  allowedChoices: CaltraAgentModelChoice[];
}

/** Validates the public policy contract without exposing provider routes or mutating sessions. */
export class CaltraAgentModelPolicyClient {
  private readonly choice = z.object({ platform_model_id: z.uuid(), reasoning_level: z.string().nullable() }).strict()
    .transform(value => ({ platformModelId: value.platform_model_id, reasoningLevel: value.reasoning_level }));

  constructor(private readonly apiKey: string, private readonly apiUrl: string, private readonly fetchImplementation: typeof fetch) {}

  async request(input: CaltraAgentModelPolicyTarget, changes?: CaltraAgentModelPolicyUpdate): Promise<CaltraAgentModelPolicy> {
    const wireChoice = (choice: CaltraAgentModelChoice) => ({ platform_model_id: choice.platformModelId, reasoning_level: choice.reasoningLevel });
    const response = await this.fetchImplementation(`${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(input.workspaceId)}/agents/${encodeURIComponent(input.agentId)}/model-policy`, {
      method: changes ? "PATCH" : "GET",
      headers: { authorization: `Bearer ${this.apiKey}`, ...(changes ? { "content-type": "application/json" } : {}) },
      ...(changes ? { body: JSON.stringify({
        ...(changes.default !== undefined ? { default: changes.default === null ? null : wireChoice(changes.default) } : {}),
        ...(changes.allowedChoices !== undefined ? { allowed_choices: changes.allowedChoices.map(wireChoice) } : {}),
      }) } : {}),
    });
    if (!response.ok) throw await CaltraServerError.fromResponse(response);
    const result = z.object({ inherits_model_policy: z.boolean(), default: this.choice.nullable(), effective_default: this.choice.nullable(), allowed_choices: z.array(this.choice) }).strict().parse(await response.json());
    return { inheritsModelPolicy: result.inherits_model_policy, default: result.default, effectiveDefault: result.effective_default, allowedChoices: result.allowed_choices };
  }
}
