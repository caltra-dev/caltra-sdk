import { z } from "zod";
import type { CaltraClient } from "./client.js";
import { CaltraMemberBody } from "./members.js";
import type { CaltraMember, CaltraWebCredential, CaltraWebCredentialCreateInput } from "./types.js";

const JSON_HEADERS = { "content-type": "application/json" };

const CredentialSchema = z.object({
  id: z.string().uuid(), label: z.string(), origin: z.string(), username: z.string(), created_at: z.string(),
}).strict();
const ListSchema = z.object({ data: z.array(CredentialSchema) }).strict();

/**
 * Resource client for website logins saved for browser profiles. The password is write-only: no
 * response carries it. The origin must be exactly scheme://host[:port] or the server answers
 * invalid_request.
 */
export class CaltraWebCredentialsClient {
  constructor(private readonly client: CaltraClient) {}

  async create(input: CaltraWebCredentialCreateInput): Promise<CaltraWebCredential> {
    const created = await this.client.requestResource("/web-credentials", CredentialSchema, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ label: input.label, origin: input.origin, username: input.username, password: input.password }),
    });
    return this.present(created);
  }

  async list(): Promise<CaltraWebCredential[]> {
    const page = await this.client.requestResource("/web-credentials", ListSchema, { method: "GET" });
    return page.data.map((credential) => this.present(credential));
  }

  async addMember(id: string, member: CaltraMember): Promise<void> {
    await this.client.requestNoContent(`/web-credentials/${encodeURIComponent(id)}/members`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(CaltraMemberBody.toWire(member)),
    });
  }

  async removeMember(id: string, member: CaltraMember): Promise<void> {
    await this.client.requestNoContent(`/web-credentials/${encodeURIComponent(id)}/members`, {
      method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify(CaltraMemberBody.toWire(member)),
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.requestNoContent(`/web-credentials/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  private present(credential: z.infer<typeof CredentialSchema>): CaltraWebCredential {
    return { id: credential.id, label: credential.label, origin: credential.origin, username: credential.username, createdAt: credential.created_at };
  }
}
