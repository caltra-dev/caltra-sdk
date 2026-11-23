import type { CaltraMember } from "./types.js";

/** Maps the SDK's camelCase member union to the wire's mutually exclusive snake_case identifiers. */
export class CaltraMemberBody {
  static toWire(member: CaltraMember): { agent_identity_id: string } | { tenant_user_id: string } {
    return "agentIdentityId" in member
      ? { agent_identity_id: member.agentIdentityId }
      : { tenant_user_id: member.tenantUserId };
  }
}
